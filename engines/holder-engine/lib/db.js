'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class HolderDatabase {
    static SCHEMA_VERSION = 7;
    static CLASSIFICATION_CACHE_BATCH_SIZE = 900;

    constructor(dbPath) {
        if (!dbPath || typeof dbPath !== 'string') {
            throw new TypeError('dbPath must be a non-empty string.');
        }

        const dir = path.dirname(dbPath);

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        this.db = new Database(dbPath);

        // SQLite runtime configuration.
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('synchronous = NORMAL');
        this.db.pragma('foreign_keys = ON');
        this.db.pragma('busy_timeout = 30000');

        // Prepared classification lookup statements are cached by batch size.
        this._classificationLookupStatements = new Map();

        this.runMigrations();

        // TEMP table exists only for this SQLite connection and is used by the
        // atomic snapshot publication transaction to detect sold-out wallets.
        this.db.prepare(`
            CREATE TEMP TABLE IF NOT EXISTS temp_snapshot_wallets (
                wallet TEXT PRIMARY KEY
            )
        `).run();

        this.prepareStatements();
        // Ranking is owned by RankingService. It is started explicitly by
        // the engine lifecycle and never rebuilt from the DB constructor.
    }

    // =============================================================
    // Helpers
    // =============================================================

    _columnExists(tableName, columnName) {
        const rows = this.db.prepare(`
            PRAGMA table_info(${tableName})
        `).all();

        return rows.some(row => row.name === columnName);
    }

    _normalizeWallet(wallet) {
        const value = String(wallet ?? '').trim();

        if (!value) {
            throw new TypeError('Wallet must be a non-empty string.');
        }

        return value;
    }

    _normalizeRawAmount(value) {
        const raw = String(value ?? '0').trim();

        try {
            const normalized = BigInt(raw);

            if (normalized < 0n) {
                throw new RangeError('Raw amount cannot be negative.');
            }

            return normalized.toString();
        } catch {
            throw new TypeError(`Invalid raw amount: ${raw}`);
        }
    }

    _normalizeUiAmount(value) {
        const normalized = String(value ?? '0').trim();
        return normalized || '0';
    }

    _parseSnapshotTimestamp(generatedAt) {
        const timestampMs = new Date(generatedAt).getTime();

        if (!Number.isFinite(timestampMs)) {
            throw new Error(
                `Invalid snapshot timestamp: ${generatedAt}`
            );
        }

        return timestampMs;
    }

    _validateSnapshotData(snapshot) {
        if (!snapshot || typeof snapshot !== 'object') {
            throw new TypeError('Invalid snapshot data.');
        }

        if (!snapshot.meta || typeof snapshot.meta !== 'object') {
            throw new TypeError('snapshot.meta must be an object.');
        }

        if (!Array.isArray(snapshot.holders)) {
            throw new TypeError('snapshot.holders must be an array.');
        }

        const generatedAt = snapshot.meta.generatedAt;
        const timestampMs = this._parseSnapshotTimestamp(generatedAt);

        const holderCount = Number(snapshot.holderCount);

        if (!Number.isSafeInteger(holderCount) || holderCount < 1) {
            throw new TypeError(
                'snapshot.holderCount must be a positive safe integer.'
            );
        }

        if (holderCount !== snapshot.holders.length) {
            throw new Error(
                `Snapshot holder count mismatch: declared=${holderCount}, actual=${snapshot.holders.length}.`
            );
        }

        const mintSupplyRaw = this._normalizeRawAmount(
            snapshot.mintSupplyRaw ??
            snapshot.meta.mintSupplyRaw ??
            snapshot.totalRawAmount ??
            '0'
        );

        const observedHolderBalanceRaw = this._normalizeRawAmount(
            snapshot.observedHolderBalanceRaw ??
            snapshot.meta.observedHolderBalanceRaw ??
            snapshot.totalRawAmount ??
            '0'
        );

        const compatibilityTotalRaw = this._normalizeRawAmount(
            snapshot.totalRawAmount ??
            observedHolderBalanceRaw
        );

        if (compatibilityTotalRaw !== observedHolderBalanceRaw) {
            throw new Error(
                `Snapshot total balance mismatch: totalRawAmount=${compatibilityTotalRaw}, observedHolderBalanceRaw=${observedHolderBalanceRaw}.`
            );
        }

        const wallets = new Set();
        let observedSum = 0n;

        for (const holder of snapshot.holders) {
            const wallet = this._normalizeWallet(holder?.wallet);

            if (wallets.has(wallet)) {
                throw new Error(
                    `Duplicate holder wallet detected during DB publication: ${wallet}`
                );
            }

            wallets.add(wallet);

            const rawAmount = this._normalizeRawAmount(
                holder.rawAmount
            );

            const uiAmount = String(holder.uiAmount ?? '').trim();
            if (!uiAmount) {
                throw new TypeError(
                    `uiAmount must be a non-empty string for ${wallet}.`
                );
            }

            if (holder.state !== undefined && holder.state !== null) {
                const state = String(holder.state);
                if (!['user', 'program', 'unknown'].includes(state)) {
                    throw new Error(
                        `Invalid holder state for ${wallet}: ${state}`
                    );
                }
            }

            if (holder.classificationVersion !== undefined && holder.classificationVersion !== null) {
                const classificationVersion = Number(holder.classificationVersion);
                if (!Number.isSafeInteger(classificationVersion) || classificationVersion < 1) {
                    throw new TypeError(
                        `Invalid classification version for ${wallet}.`
                    );
                }
            }

            observedSum += BigInt(rawAmount);
        }

        if (observedSum.toString() !== observedHolderBalanceRaw) {
            throw new Error(
                `Snapshot observed-balance mismatch: sum=${observedSum.toString()}, declared=${observedHolderBalanceRaw}.`
            );
        }

        return {
            generatedAt,
            timestampMs,
            holderCount,
            mintSupplyRaw,
            observedHolderBalanceRaw
        };
    }

    // =============================================================
    // Migrations
    // =============================================================

    runMigrations() {
        const currentVersion = Number(
            this.db.pragma('user_version', { simple: true })
        );

        if (!Number.isInteger(currentVersion) || currentVersion < 0) {
            throw new Error(
                `Invalid SQLite schema version: ${currentVersion}`
            );
        }

        if (currentVersion >= HolderDatabase.SCHEMA_VERSION) {
            return;
        }

        const migrate = this.db.transaction(() => {
            let version = currentVersion;

            if (version < 1) {
                this.db.prepare(`
                    CREATE TABLE IF NOT EXISTS holder_meta (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp TEXT NOT NULL,
                        timestamp_ms INTEGER NOT NULL,
                        total_holders INTEGER NOT NULL,
                        total_supply TEXT NOT NULL
                    )
                `).run();

                this.db.prepare(`
                    CREATE TABLE IF NOT EXISTS holders_list (
                        wallet TEXT PRIMARY KEY,
                        raw_amount TEXT NOT NULL,
                        ui_amount TEXT NOT NULL,
                        state TEXT NOT NULL,
                        activity TEXT NOT NULL DEFAULT 'not-active'
                            CHECK (activity IN ('active', 'not-active')),
                        last_updated_ms INTEGER NOT NULL,
                        last_sell_all_time INTEGER DEFAULT NULL
                    )
                `).run();

                this.db.prepare(`
                    CREATE TABLE IF NOT EXISTS "100_top_holders" (
                        rank INTEGER PRIMARY KEY
                            CHECK (rank >= 1 AND rank <= 100),
                        wallet TEXT NOT NULL UNIQUE,
                        raw_amount TEXT NOT NULL,
                        ui_amount TEXT NOT NULL,
                        state TEXT NOT NULL CHECK (state = 'user'),
                        last_updated_ms INTEGER NOT NULL,
                        last_sell_all_time INTEGER DEFAULT NULL,
                        snapshot_timestamp TEXT NOT NULL
                    )
                `).run();

                version = 1;
                this.db.pragma('user_version = 1');
            }

            if (version < 2) {
                if (!this._columnExists('holders_list', 'last_sell_all_time')) {
                    this.db.prepare(`
                        ALTER TABLE holders_list
                        ADD COLUMN last_sell_all_time INTEGER DEFAULT NULL
                    `).run();
                }

                if (!this._columnExists('holders_list', 'activity')) {
                    this.db.prepare(`
                        ALTER TABLE holders_list
                        ADD COLUMN activity TEXT NOT NULL DEFAULT 'not-active'
                    `).run();
                }

                this.db.prepare(`
                    UPDATE holders_list
                    SET activity = CASE
                        WHEN raw_amount = '0' THEN 'not-active'
                        ELSE 'active'
                    END
                `).run();

                this.db.prepare(`
                    CREATE TABLE IF NOT EXISTS holder_rankings (
                        wallet TEXT PRIMARY KEY,
                        rank INTEGER NOT NULL UNIQUE CHECK (rank >= 1),
                        snapshot_timestamp TEXT NOT NULL
                    )
                `).run();

                version = 2;
                this.db.pragma('user_version = 2');
            }

            if (version < 3) {
                this.db.prepare(`
                    CREATE TABLE IF NOT EXISTS holder_verification (
                        wallet TEXT PRIMARY KEY,
                        birthday_ms INTEGER DEFAULT NULL,
                        birthday_signature TEXT DEFAULT NULL,
                        age_seconds INTEGER NOT NULL DEFAULT 0,
                        verification_state TEXT NOT NULL
                            CHECK (
                                verification_state IN (
                                    'pending',
                                    'active',
                                    'sold_all',
                                    'no_buy',
                                    'unknown'
                                )
                            ),
                        last_verified_ms INTEGER NOT NULL
                    )
                `).run();

                this.db.prepare(`
                    CREATE TABLE IF NOT EXISTS holder_purchase_stats (
                        wallet TEXT PRIMARY KEY,
                        buy_count INTEGER NOT NULL DEFAULT 0,
                        total_buys_raw TEXT NOT NULL DEFAULT '0',
                        last_buy_block_time INTEGER DEFAULT NULL,
                        last_buy_signature TEXT DEFAULT NULL,
                        updated_at_ms INTEGER NOT NULL
                    )
                `).run();

                this.db.prepare(`
                    CREATE TABLE IF NOT EXISTS holder_projection_cursor (
                        projection_name TEXT PRIMARY KEY,
                        last_processed_id INTEGER NOT NULL DEFAULT 0,
                        updated_at_ms INTEGER NOT NULL
                    )
                `).run();

                this.db.prepare(`
                    CREATE TABLE IF NOT EXISTS holder_social_stats (
                        wallet TEXT PRIMARY KEY,
                        likes INTEGER NOT NULL DEFAULT 0,
                        shares INTEGER NOT NULL DEFAULT 0,
                        views INTEGER NOT NULL DEFAULT 0,
                        created_at_ms INTEGER NOT NULL,
                        updated_at_ms INTEGER NOT NULL
                    )
                `).run();

                version = 3;
                this.db.pragma('user_version = 3');
            }

            if (version < 4) {
                this.db.prepare(`
                    CREATE INDEX IF NOT EXISTS idx_holders_amount
                    ON holders_list(CAST(ui_amount AS REAL) DESC)
                `).run();

                this.db.prepare(`
                    CREATE INDEX IF NOT EXISTS idx_holders_state_activity_raw
                    ON holders_list(
                        state,
                        activity,
                        LENGTH(raw_amount) DESC,
                        raw_amount DESC,
                        wallet ASC
                    )
                `).run();

                this.db.prepare(`
                    CREATE INDEX IF NOT EXISTS idx_holders_last_sell
                    ON holders_list(last_sell_all_time)
                `).run();

                this.db.prepare(`
                    CREATE INDEX IF NOT EXISTS idx_holder_verification_state
                    ON holder_verification(verification_state)
                `).run();

                this.db.prepare(`
                    DROP VIEW IF EXISTS holder_profile
                `).run();

                this.db.prepare(`
                    CREATE VIEW holder_profile AS
                    SELECT
                        h.wallet,
                        h.raw_amount,
                        h.ui_amount,
                        h.state,
                        h.activity,
                        h.last_updated_ms,
                        h.last_sell_all_time,
                        r.rank,
                        v.birthday_ms,
                        v.birthday_signature,
                        v.age_seconds,
                        COALESCE(v.verification_state, 'unknown')
                            AS verification_state,
                        COALESCE(p.buy_count, 0) AS buy_count,
                        COALESCE(p.total_buys_raw, '0') AS total_buys_raw,
                        p.last_buy_block_time,
                        p.last_buy_signature,
                        COALESCE(s.likes, 0) AS likes,
                        COALESCE(s.shares, 0) AS shares,
                        COALESCE(s.views, 0) AS views
                    FROM holders_list h
                    LEFT JOIN holder_rankings r ON r.wallet = h.wallet
                    LEFT JOIN holder_verification v ON v.wallet = h.wallet
                    LEFT JOIN holder_purchase_stats p ON p.wallet = h.wallet
                    LEFT JOIN holder_social_stats s ON s.wallet = h.wallet
                `).run();

                version = 4;
                this.db.pragma('user_version = 4');
            }

            if (version < 5) {
                if (!this._columnExists(
                    'holders_list',
                    'classification_updated_ms'
                )) {
                    this.db.prepare(`
                        ALTER TABLE holders_list
                        ADD COLUMN classification_updated_ms INTEGER DEFAULT NULL
                    `).run();
                }

                this.db.prepare(`
                    UPDATE holders_list
                    SET classification_updated_ms = CASE
                        WHEN state IN ('user', 'program')
                            THEN last_updated_ms
                        ELSE NULL
                    END
                    WHERE classification_updated_ms IS NULL
                `).run();

                this.db.prepare(`
                    CREATE INDEX IF NOT EXISTS idx_holders_classification_cache
                    ON holders_list(
                        classification_updated_ms,
                        state,
                        wallet
                    )
                `).run();

                version = 5;
                this.db.pragma('user_version = 5');
            }

            if (version < 6) {
                if (!this._columnExists(
                    'holder_meta',
                    'observed_holder_balance'
                )) {
                    this.db.prepare(`
                        ALTER TABLE holder_meta
                        ADD COLUMN observed_holder_balance TEXT NOT NULL DEFAULT '0'
                    `).run();
                }

                this.db.prepare(`
                    UPDATE holder_meta
                    SET observed_holder_balance = total_supply
                    WHERE observed_holder_balance = '0'
                `).run();

                if (!this._columnExists(
                    'holders_list',
                    'classification_version'
                )) {
                    this.db.prepare(`
                        ALTER TABLE holders_list
                        ADD COLUMN classification_version INTEGER NOT NULL DEFAULT 1
                    `).run();
                }

                this.db.prepare(`
                    CREATE INDEX IF NOT EXISTS idx_holders_classification_version
                    ON holders_list(
                        classification_version,
                        classification_updated_ms,
                        wallet
                    )
                `).run();

                version = 6;
                this.db.pragma('user_version = 6');
            }

            if (version < 7) {
                this.db.prepare(`
                    CREATE TABLE IF NOT EXISTS classification_queue (
                        wallet TEXT PRIMARY KEY,
                        reason TEXT NOT NULL,
                        status TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'in_progress', 'failed')),
                        attempts INTEGER NOT NULL DEFAULT 0,
                        available_at_ms INTEGER NOT NULL,
                        locked_at_ms INTEGER DEFAULT NULL,
                        last_error TEXT DEFAULT NULL,
                        created_at_ms INTEGER NOT NULL,
                        updated_at_ms INTEGER NOT NULL
                    )
                `).run();

                this.db.prepare(`
                    CREATE TABLE IF NOT EXISTS holder_classification_history (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        wallet TEXT NOT NULL,
                        previous_state TEXT DEFAULT NULL,
                        new_state TEXT NOT NULL
                            CHECK (new_state IN ('user', 'program', 'unknown')),
                        reason TEXT NOT NULL,
                        classification_version INTEGER NOT NULL,
                        checked_at_ms INTEGER NOT NULL,
                        snapshot_timestamp TEXT DEFAULT NULL
                    )
                `).run();

                this.db.prepare(`
                    CREATE INDEX IF NOT EXISTS idx_classification_queue_ready
                    ON classification_queue(
                        status,
                        available_at_ms,
                        wallet
                    )
                `).run();

                this.db.prepare(`
                    CREATE INDEX IF NOT EXISTS idx_classification_history_wallet
                    ON holder_classification_history(wallet, checked_at_ms DESC)
                `).run();

                this.db.prepare(`
                    CREATE INDEX IF NOT EXISTS idx_holders_classification_priority
                    ON holders_list(
                        activity,
                        classification_updated_ms,
                        classification_version,
                        LENGTH(raw_amount) DESC,
                        raw_amount DESC,
                        wallet ASC
                    )
                `).run();

                version = 7;
                this.db.pragma('user_version = 7');
            }
        });

        migrate();
    }

    // =============================================================
    // Prepared statements
    // =============================================================

    prepareStatements() {
        this.statements = {
            insertMeta: this.db.prepare(`
                INSERT INTO holder_meta (
                    timestamp,
                    timestamp_ms,
                    total_holders,
                    total_supply,
                    observed_holder_balance
                )
                VALUES (?, ?, ?, ?, ?)
            `),

            upsertHolder: this.db.prepare(`
                INSERT INTO holders_list (
                    wallet,
                    raw_amount,
                    ui_amount,
                    state,
                    activity,
                    classification_updated_ms,
                    classification_version,
                    last_updated_ms
                )
                VALUES (
                    @wallet,
                    @rawAmount,
                    @uiAmount,
                    @state,
                    @activity,
                    @classificationUpdatedMs,
                    @classificationVersion,
                    @lastUpdatedMs
                )
                ON CONFLICT(wallet)
                DO UPDATE SET
                    raw_amount = excluded.raw_amount,
                    ui_amount = excluded.ui_amount,
                    state = excluded.state,
                    activity = excluded.activity,
                    classification_updated_ms =
                        excluded.classification_updated_ms,
                    classification_version =
                        excluded.classification_version,
                    last_updated_ms = excluded.last_updated_ms
            `),

            updateSoldOut: this.db.prepare(`
                UPDATE holders_list
                SET
                    raw_amount = '0',
                    ui_amount = '0',
                    activity = 'not-active',
                    last_updated_ms = ?,
                    last_sell_all_time =
                        CASE
                            WHEN raw_amount <> '0' THEN ?
                            ELSE last_sell_all_time
                        END
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM temp_snapshot_wallets s
                    WHERE s.wallet = holders_list.wallet
                )
            `),

            clearRankings: this.db.prepare(`
                DELETE FROM holder_rankings
            `),

            insertRankings: this.db.prepare(`
                INSERT INTO holder_rankings (
                    wallet,
                    rank,
                    snapshot_timestamp
                )
                SELECT
                    wallet,
                    ROW_NUMBER() OVER (
                        ORDER BY
                            LENGTH(raw_amount) DESC,
                            raw_amount DESC,
                            wallet ASC
                    ) AS rank,
                    @snapshotTimestamp
                FROM holders_list
                WHERE
                    state = 'user'
                    AND activity = 'active'
                    AND raw_amount <> '0'
                ORDER BY
                    LENGTH(raw_amount) DESC,
                    raw_amount DESC,
                    wallet ASC
            `),

            clearTop100: this.db.prepare(`
                DELETE FROM "100_top_holders"
            `),

            insertTop100: this.db.prepare(`
                INSERT INTO "100_top_holders" (
                    rank,
                    wallet,
                    raw_amount,
                    ui_amount,
                    state,
                    last_updated_ms,
                    last_sell_all_time,
                    snapshot_timestamp
                )
                SELECT
                    r.rank,
                    h.wallet,
                    h.raw_amount,
                    h.ui_amount,
                    h.state,
                    h.last_updated_ms,
                    h.last_sell_all_time,
                    r.snapshot_timestamp
                FROM holder_rankings r
                INNER JOIN holders_list h
                    ON h.wallet = r.wallet
                WHERE r.rank <= 100
                ORDER BY r.rank ASC
            `),

            getTop100Count: this.db.prepare(`
                SELECT COUNT(*) AS count
                FROM "100_top_holders"
            `),

            getTop100Integrity: this.db.prepare(`
                SELECT
                    COUNT(*) AS count,
                    COUNT(DISTINCT wallet) AS distinct_wallets,
                    MIN(rank) AS min_rank,
                    MAX(rank) AS max_rank,
                    SUM(
                        CASE
                            WHEN state = 'user' AND raw_amount <> '0'
                                THEN 0
                            ELSE 1
                        END
                    ) AS invalid_states
                FROM "100_top_holders"
            `),

            insertTempSnapshotWallet: this.db.prepare(`
                INSERT OR IGNORE
                INTO temp_snapshot_wallets (wallet)
                VALUES (?)
            `),

            clearTempSnapshotWallets: this.db.prepare(`
                DELETE FROM temp_snapshot_wallets
            `),

            getTop100: this.db.prepare(`
                SELECT
                    rank,
                    wallet,
                    raw_amount AS rawAmount,
                    ui_amount AS uiAmount,
                    state,
                    last_updated_ms AS lastUpdatedMs,
                    last_sell_all_time AS lastSellAllTime,
                    snapshot_timestamp AS snapshotTimestamp
                FROM "100_top_holders"
                ORDER BY rank ASC
            `),

            getProjectionCursor: this.db.prepare(`
                SELECT
                    projection_name AS projectionName,
                    last_processed_id AS lastProcessedId,
                    updated_at_ms AS updatedAtMs
                FROM holder_projection_cursor
                WHERE projection_name = ?
            `),

            upsertProjectionCursor: this.db.prepare(`
                INSERT INTO holder_projection_cursor (
                    projection_name,
                    last_processed_id,
                    updated_at_ms
                )
                VALUES (?, ?, ?)
                ON CONFLICT(projection_name)
                DO UPDATE SET
                    last_processed_id = excluded.last_processed_id,
                    updated_at_ms = excluded.updated_at_ms
            `),

            getHolderProfile: this.db.prepare(`
                SELECT
                    wallet,
                    raw_amount AS rawAmount,
                    ui_amount AS uiAmount,
                    state,
                    activity,
                    last_updated_ms AS lastUpdatedMs,
                    last_sell_all_time AS lastSellAllTime,
                    rank,
                    birthday_ms AS birthdayMs,
                    birthday_signature AS birthdaySignature,
                    age_seconds AS ageSeconds,
                    verification_state AS verificationState,
                    buy_count AS buyCount,
                    total_buys_raw AS totalBuysRaw,
                    last_buy_block_time AS lastBuyBlockTime,
                    last_buy_signature AS lastBuySignature,
                    likes,
                    shares,
                    views
                FROM holder_profile
                WHERE wallet = ?
            `),

            incrementLike: this.db.prepare(`
                INSERT INTO holder_social_stats (
                    wallet,
                    likes,
                    shares,
                    views,
                    created_at_ms,
                    updated_at_ms
                )
                VALUES (?, 1, 0, 0, ?, ?)
                ON CONFLICT(wallet)
                DO UPDATE SET
                    likes = likes + 1,
                    updated_at_ms = excluded.updated_at_ms
            `),

            incrementShare: this.db.prepare(`
                INSERT INTO holder_social_stats (
                    wallet,
                    likes,
                    shares,
                    views,
                    created_at_ms,
                    updated_at_ms
                )
                VALUES (?, 0, 1, 0, ?, ?)
                ON CONFLICT(wallet)
                DO UPDATE SET
                    shares = shares + 1,
                    updated_at_ms = excluded.updated_at_ms
            `),

            incrementView: this.db.prepare(`
                INSERT INTO holder_social_stats (
                    wallet,
                    likes,
                    shares,
                    views,
                    created_at_ms,
                    updated_at_ms
                )
                VALUES (?, 0, 0, 1, ?, ?)
                ON CONFLICT(wallet)
                DO UPDATE SET
                    views = views + 1,
                    updated_at_ms = excluded.updated_at_ms
            `),

            upsertPurchaseStats: this.db.prepare(`
                INSERT INTO holder_purchase_stats (
                    wallet,
                    buy_count,
                    total_buys_raw,
                    last_buy_block_time,
                    last_buy_signature,
                    updated_at_ms
                )
                VALUES (
                    @wallet,
                    @buyCount,
                    @totalBuysRaw,
                    @lastBuyBlockTime,
                    @lastBuySignature,
                    @updatedAtMs
                )
                ON CONFLICT(wallet)
                DO UPDATE SET
                    buy_count = excluded.buy_count,
                    total_buys_raw = excluded.total_buys_raw,
                    last_buy_block_time = excluded.last_buy_block_time,
                    last_buy_signature = excluded.last_buy_signature,
                    updated_at_ms = excluded.updated_at_ms
            `)
        };
    }

    // =============================================================
    // Classification cache
    // =============================================================

    getClassificationCacheForWallets(
        wallets,
        batchSize = HolderDatabase.CLASSIFICATION_CACHE_BATCH_SIZE
    ) {
        if (!Array.isArray(wallets) || wallets.length === 0) {
            return new Map();
        }

        const normalizedBatchSize = Number(batchSize);

        if (
            !Number.isInteger(normalizedBatchSize) ||
            normalizedBatchSize < 1 ||
            normalizedBatchSize > 900
        ) {
            throw new TypeError(
                'batchSize must be an integer between 1 and 900.'
            );
        }

        const uniqueWallets = Array.from(
            new Set(
                wallets
                    .map(wallet => String(wallet ?? '').trim())
                    .filter(Boolean)
            )
        );

        const result = new Map();

        for (
            let offset = 0;
            offset < uniqueWallets.length;
            offset += normalizedBatchSize
        ) {
            const batch = uniqueWallets.slice(
                offset,
                offset + normalizedBatchSize
            );

            const statementCacheKey = batch.length;
            let statement =
                this._classificationLookupStatements.get(
                    statementCacheKey
                );

            if (!statement) {
                const placeholders = batch
                    .map(() => '?')
                    .join(', ');

                statement = this.db.prepare(`
                    SELECT
                        wallet,
                        state,
                        classification_updated_ms
                            AS classificationUpdatedMs,
                        classification_version
                            AS classificationVersion
                    FROM holders_list
                    WHERE
                        classification_updated_ms IS NOT NULL
                        AND wallet IN (${placeholders})
                `);

                this._classificationLookupStatements.set(
                    statementCacheKey,
                    statement
                );
            }

            const rows = statement.all(...batch);

            for (const row of rows) {
                result.set(row.wallet, {
                    state: row.state,
                    updatedAtMs:
                        row.classificationUpdatedMs,
                    version:
                        row.classificationVersion
                });
            }
        }

        return result;
    }

    // =============================================================
    // Snapshot metadata
    // =============================================================

    saveMeta(data) {
        if (!data || !data.meta) {
            throw new TypeError('Invalid snapshot data.');
        }

        const generatedAt = data.meta.generatedAt;
        const timestampMs = this._parseSnapshotTimestamp(generatedAt);
        const holderCount = Number(data.holderCount ?? 0);
        const mintSupplyRaw = this._normalizeRawAmount(
            data.mintSupplyRaw ??
            data.meta.mintSupplyRaw ??
            data.totalRawAmount ??
            '0'
        );
        const observedHolderBalanceRaw = this._normalizeRawAmount(
            data.observedHolderBalanceRaw ??
            data.meta.observedHolderBalanceRaw ??
            data.totalRawAmount ??
            '0'
        );

        if (!Number.isInteger(holderCount) || holderCount < 0) {
            throw new TypeError(
                'holderCount must be a non-negative integer.'
            );
        }

        this.statements.insertMeta.run(
            generatedAt,
            timestampMs,
            holderCount,
            mintSupplyRaw,
            observedHolderBalanceRaw
        );

        return timestampMs;
    }

    // =============================================================
    // Internal holder synchronization.
    // MUST be invoked inside a transaction.
    // =============================================================

    // =============================================================
    // Atomic snapshot publication.
    // =============================================================

    publishSnapshot(snapshot) {
        // Backward-compatible entry point. Snapshot publication intentionally
        // does not classify holders or rebuild rankings.
        return this.publishHolderSnapshot(snapshot);
    }

    // =============================================================
    // Compatibility API.
    // Prefer publishSnapshot() for new snapshot publication.
    // =============================================================

    syncHoldersSnapshot(activeHolders, timestampMs) {
        if (!Array.isArray(activeHolders)) {
            throw new TypeError('activeHolders must be an array.');
        }

        if (!Number.isFinite(timestampMs)) {
            throw new TypeError('timestampMs must be a valid number.');
        }

        const syncTransaction = this.db.transaction(() => {
            this._syncSnapshotBalancesTransaction(
                activeHolders,
                timestampMs
            );
        });

        syncTransaction.immediate();
    }

    // =============================================================
    // Full ranking rebuild
    // =============================================================

    rebuildRankings(snapshotTimestamp) {
        if (!snapshotTimestamp) {
            throw new TypeError(
                'snapshotTimestamp is required.'
            );
        }

        const rebuildTransaction = this.db.transaction(() => {
            this.statements.clearRankings.run();
            this.statements.insertRankings.run({
                snapshotTimestamp: String(snapshotTimestamp)
            });
        });

        rebuildTransaction.immediate();
    }

    // =============================================================
    // Materialize Top 100
    // =============================================================

    rebuildTop100FromRankings() {
        const rebuildTransaction = this.db.transaction(() => {
            this.statements.clearTop100.run();
            this.statements.insertTop100.run();
        });

        rebuildTransaction.immediate();
    }

    getTop100UserHolders() {
        return this.statements.getTop100.all();
    }

    getTopHolders(limit = 100) {
        const safeLimit =
            Number.isInteger(limit) && limit > 0
                ? Math.min(limit, 100)
                : 100;

        return this.db.prepare(`
            SELECT
                r.rank,
                h.wallet,
                h.raw_amount AS rawAmount,
                h.ui_amount AS uiAmount,
                h.state,
                h.activity,
                h.last_updated_ms AS lastUpdatedMs,
                h.last_sell_all_time AS lastSellAllTime,
                r.snapshot_timestamp AS snapshotTimestamp
            FROM holder_rankings r
            INNER JOIN holders_list h
                ON h.wallet = r.wallet
            WHERE r.rank <= ?
            ORDER BY r.rank ASC
        `).all(safeLimit);
    }

    // =============================================================
    // Holder profile
    // =============================================================

    getHolderProfile(wallet) {
        const normalizedWallet = this._normalizeWallet(wallet);

        const row = this.statements.getHolderProfile.get(
            normalizedWallet
        );

        if (!row) {
            return null;
        }

        let ageSeconds = Number.isInteger(row.ageSeconds)
            ? row.ageSeconds
            : 0;

        if (Number.isFinite(row.birthdayMs)) {
            ageSeconds = Math.max(
                0,
                Math.floor(
                    (Date.now() - Number(row.birthdayMs)) / 1000
                )
            );
        }

        return {
            wallet: row.wallet,
            rawAmount: row.rawAmount,
            uiAmount: row.uiAmount,
            state: row.state,
            activity: row.activity,
            rank: row.rank ?? null,
            lastUpdatedMs: row.lastUpdatedMs,
            lastSellAllTime: row.lastSellAllTime ?? null,
            birthdayMs: row.birthdayMs ?? null,
            birthdaySignature: row.birthdaySignature ?? null,
            ageSeconds,
            verificationState: row.verificationState,
            buyCount: Number(row.buyCount ?? 0),
            totalBuysRaw: String(row.totalBuysRaw ?? '0'),
            lastBuyBlockTime: row.lastBuyBlockTime ?? null,
            lastBuySignature: row.lastBuySignature ?? null,
            likes: Number(row.likes ?? 0),
            shares: Number(row.shares ?? 0),
            views: Number(row.views ?? 0)
        };
    }

    // =============================================================
    // Projection cursor
    // =============================================================

    getProjectionCursor(projectionName) {
        const name = String(projectionName ?? '').trim();

        if (!name) {
            throw new TypeError(
                'projectionName is required.'
            );
        }

        const row = this.statements.getProjectionCursor.get(name);

        if (!row) {
            return {
                projectionName: name,
                lastProcessedId: 0,
                updatedAtMs: 0
            };
        }

        return row;
    }

    setProjectionCursor(
        projectionName,
        lastProcessedId,
        updatedAtMs = Date.now()
    ) {
        const name = String(projectionName ?? '').trim();
        const processedId = Number(lastProcessedId);
        const timestamp = Number(updatedAtMs);

        if (!name) {
            throw new TypeError(
                'projectionName is required.'
            );
        }

        if (
            !Number.isInteger(processedId) ||
            processedId < 0
        ) {
            throw new TypeError(
                'lastProcessedId must be a non-negative integer.'
            );
        }

        if (!Number.isFinite(timestamp)) {
            throw new TypeError(
                'updatedAtMs must be a valid number.'
            );
        }

        this.statements.upsertProjectionCursor.run(
            name,
            processedId,
            timestamp
        );
    }

    // =============================================================
    // Purchase projection
    // =============================================================

    upsertPurchaseStats({
        wallet,
        buyCount,
        totalBuysRaw,
        lastBuyBlockTime = null,
        lastBuySignature = null,
        updatedAtMs = Date.now()
    }) {
        const normalizedWallet = this._normalizeWallet(wallet);
        const normalizedBuyCount = Number(buyCount);

        if (
            !Number.isInteger(normalizedBuyCount) ||
            normalizedBuyCount < 0
        ) {
            throw new TypeError(
                'buyCount must be a non-negative integer.'
            );
        }

        const normalizedTotalBuysRaw =
            this._normalizeRawAmount(totalBuysRaw);

        const normalizedUpdatedAt = Number(updatedAtMs);

        if (!Number.isFinite(normalizedUpdatedAt)) {
            throw new TypeError(
                'updatedAtMs must be a valid number.'
            );
        }

        this.statements.upsertPurchaseStats.run({
            wallet: normalizedWallet,
            buyCount: normalizedBuyCount,
            totalBuysRaw: normalizedTotalBuysRaw,
            lastBuyBlockTime:
                lastBuyBlockTime === null
                    ? null
                    : Number(lastBuyBlockTime),
            lastBuySignature:
                lastBuySignature
                    ? String(lastBuySignature)
                    : null,
            updatedAtMs: normalizedUpdatedAt
        });
    }

    // =============================================================
    // Social counters
    // =============================================================

    incrementLike(wallet) {
        const normalizedWallet = this._normalizeWallet(wallet);
        const now = Date.now();

        this.statements.incrementLike.run(
            normalizedWallet,
            now,
            now
        );
    }

    incrementShare(wallet) {
        const normalizedWallet = this._normalizeWallet(wallet);
        const now = Date.now();

        this.statements.incrementShare.run(
            normalizedWallet,
            now,
            now
        );
    }

    incrementView(wallet) {
        const normalizedWallet = this._normalizeWallet(wallet);
        const now = Date.now();

        this.statements.incrementView.run(
            normalizedWallet,
            now,
            now
        );
    }

    // =============================================================
    // Independent Snapshot / Classification / Ranking APIs
    // =============================================================

    publishHolderSnapshot(snapshot) {
        const validated = this._validateSnapshotData(snapshot);

        const publishTransaction = this.db.transaction(() => {
            this.statements.insertMeta.run(
                validated.generatedAt,
                validated.timestampMs,
                validated.holderCount,
                validated.mintSupplyRaw,
                validated.observedHolderBalanceRaw
            );

            this._syncSnapshotBalancesTransaction(
                snapshot.holders,
                validated.timestampMs
            );

        });

        publishTransaction.immediate();
        return validated.timestampMs;
    }

    _syncSnapshotBalancesTransaction(activeHolders, timestampMs) {
        if (!Array.isArray(activeHolders)) {
            throw new TypeError('activeHolders must be an array.');
        }

        if (!Number.isFinite(timestampMs)) {
            throw new TypeError('timestampMs must be a valid number.');
        }

        this.statements.clearTempSnapshotWallets.run();

        const insertTemp = this.statements.insertTempSnapshotWallet;
        const existingState = this.db.prepare(`
            SELECT 1 AS exists_row
            FROM holders_list
            WHERE wallet = ?
        `);
        const insertNew = this.db.prepare(`
            INSERT INTO holders_list (
                wallet,
                raw_amount,
                ui_amount,
                state,
                activity,
                classification_updated_ms,
                classification_version,
                last_updated_ms
            )
            VALUES (?, ?, ?, 'unknown', 'active', NULL, 1, ?)
        `);
        const updateExisting = this.db.prepare(`
            UPDATE holders_list
            SET
                raw_amount = ?,
                ui_amount = ?,
                activity = 'active',
                last_updated_ms = ?
            WHERE wallet = ?
        `);

        for (const holder of activeHolders) {
            const wallet = String(holder?.wallet || '').trim();
            if (!wallet) continue;

            const rawAmount = this._normalizeRawAmount(holder.rawAmount);
            const uiAmount = this._normalizeUiAmount(holder.uiAmount);

            insertTemp.run(wallet);

            const existing = existingState.get(wallet);
            if (existing) {
                updateExisting.run(
                    rawAmount,
                    uiAmount,
                    timestampMs,
                    wallet
                );
            } else {
                insertNew.run(
                    wallet,
                    rawAmount,
                    uiAmount,
                    timestampMs
                );
            }
        }

        this.statements.updateSoldOut.run(timestampMs, timestampMs);
    }

    getLatestSnapshotTimestamp() {
        const row = this.db.prepare(`
            SELECT timestamp
            FROM holder_meta
            ORDER BY timestamp_ms DESC, id DESC
            LIMIT 1
        `).get();
        return row?.timestamp || null;
    }

    getLatestSnapshotMeta() {
        const row = this.db.prepare(`
            SELECT
                timestamp AS generatedAt,
                timestamp_ms AS timestampMs,
                total_holders AS holderCount,
                total_supply AS mintSupplyRaw,
                observed_holder_balance AS observedHolderBalanceRaw
            FROM holder_meta
            ORDER BY timestamp_ms DESC, id DESC
            LIMIT 1
        `).get();
        return row || null;
    }

    recoverClassificationLeases(nowMs = Date.now(), leaseMs = 300000) {
        const now = Number(nowMs);
        const lease = Number(leaseMs);
        if (!Number.isFinite(now) || !Number.isFinite(lease) || lease <= 0) {
            throw new TypeError('Invalid classification lease parameters.');
        }

        return this.db.prepare(`
            UPDATE classification_queue
            SET
                status = 'pending',
                available_at_ms = ?,
                locked_at_ms = NULL,
                last_error = COALESCE(last_error, 'Recovered stale classification lease.'),
                updated_at_ms = ?
            WHERE status = 'in_progress'
              AND locked_at_ms IS NOT NULL
              AND locked_at_ms <= ?
        `).run(now, now, now - lease).changes;
    }

    claimClassificationCandidates({
        nowMs = Date.now(),
        limit = 600,
        normalTtlMs = 6 * 60 * 60 * 1000,
        unknownTtlMs = 2 * 60 * 1000,
        classificationVersion = 1,
        leaseMs = 300000
    } = {}) {
        const now = Number(nowMs);
        const safeLimit = Math.max(1, Math.min(2000, Number(limit)));
        const normalTtl = Math.max(1000, Number(normalTtlMs));
        const unknownTtl = Math.max(1000, Number(unknownTtlMs));
        const version = Number(classificationVersion);
        const lease = Math.max(30_000, Number(leaseMs));

        if (!Number.isFinite(now) || !Number.isInteger(safeLimit) || !Number.isSafeInteger(version) || version < 1) {
            throw new TypeError('Invalid classification candidate parameters.');
        }

        const claimTransaction = this.db.transaction(() => {
            const rows = this.db.prepare(`
                SELECT
                    h.wallet,
                    CASE
                        WHEN h.classification_updated_ms IS NULL THEN 'new_holder'
                        WHEN h.classification_version <> ? THEN 'classification_version_upgrade'
                        WHEN h.state = 'unknown'
                             AND h.classification_updated_ms <= ? THEN 'unknown_refresh'
                        WHEN h.classification_updated_ms <= ? THEN 'ttl_refresh'
                        ELSE 'background'
                    END AS reason
                FROM holders_list h
                LEFT JOIN classification_queue q
                    ON q.wallet = h.wallet
                WHERE h.activity = 'active'
                  AND (
                        h.classification_updated_ms IS NULL
                        OR h.classification_version <> ?
                        OR (
                            h.state = 'unknown'
                            AND h.classification_updated_ms <= ?
                        )
                        OR (
                            h.state IN ('user', 'program')
                            AND h.classification_updated_ms <= ?
                        )
                  )
                  AND (
                        q.wallet IS NULL
                        OR (
                            q.status IN ('pending', 'failed')
                            AND q.available_at_ms <= ?
                        )
                  )
                ORDER BY
                    CASE
                        WHEN h.classification_updated_ms IS NULL THEN 0
                        WHEN h.classification_version <> ? THEN 1
                        ELSE 2
                    END ASC,
                    LENGTH(h.raw_amount) DESC,
                    h.raw_amount DESC,
                    h.wallet ASC
                LIMIT ?
            `).all(
                version,
                now - unknownTtl,
                now - normalTtl,
                version,
                now - unknownTtl,
                now - normalTtl,
                now,
                version,
                safeLimit
            );

            const upsertQueue = this.db.prepare(`
                INSERT INTO classification_queue (
                    wallet,
                    reason,
                    status,
                    attempts,
                    available_at_ms,
                    locked_at_ms,
                    last_error,
                    created_at_ms,
                    updated_at_ms
                )
                VALUES (?, ?, 'in_progress', 1, ?, ?, NULL, ?, ?)
                ON CONFLICT(wallet) DO UPDATE SET
                    reason = excluded.reason,
                    status = 'in_progress',
                    attempts = classification_queue.attempts + 1,
                    available_at_ms = excluded.available_at_ms,
                    locked_at_ms = excluded.locked_at_ms,
                    last_error = NULL,
                    updated_at_ms = excluded.updated_at_ms
            `);

            for (const row of rows) {
                upsertQueue.run(
                    row.wallet,
                    row.reason,
                    now,
                    now,
                    now,
                    now
                );
            }

            return rows;
        });

        return claimTransaction();
    }

    applyClassificationResults(updates, {
        classificationVersion = 1,
        checkedAtMs = Date.now()
    } = {}) {
        if (!Array.isArray(updates) || updates.length === 0) return 0;

        const version = Number(classificationVersion);
        const checkedAt = Number(checkedAtMs);
        if (!Number.isSafeInteger(version) || version < 1 || !Number.isFinite(checkedAt)) {
            throw new TypeError('Invalid classification result metadata.');
        }

        const tx = this.db.transaction(() => {
            const getCurrent = this.db.prepare(`
                SELECT state FROM holders_list WHERE wallet = ?
            `);
            const insertHistory = this.db.prepare(`
                INSERT INTO holder_classification_history (
                    wallet,
                    previous_state,
                    new_state,
                    reason,
                    classification_version,
                    checked_at_ms,
                    snapshot_timestamp
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            const updateHolder = this.db.prepare(`
                UPDATE holders_list
                SET
                    state = ?,
                    classification_updated_ms = ?,
                    classification_version = ?
                WHERE wallet = ?
                  AND activity = 'active'
            `);
            const deleteQueue = this.db.prepare(`
                DELETE FROM classification_queue
                WHERE wallet = ?
            `);

            let updated = 0;
            const snapshotTimestamp = this.getLatestSnapshotTimestamp();

            for (const item of updates) {
                const wallet = this._normalizeWallet(item.wallet);
                const state = String(item.state || 'unknown');
                if (!['user', 'program', 'unknown'].includes(state)) {
                    throw new TypeError(`Invalid classification state for ${wallet}: ${state}`);
                }

                const current = getCurrent.get(wallet);
                if (!current) {
                    deleteQueue.run(wallet);
                    continue;
                }

                const classifiedAt = Number(item.classificationUpdatedMs || checkedAt);
                if (!Number.isFinite(classifiedAt) || classifiedAt <= 0) {
                    throw new TypeError(`Invalid classification timestamp for ${wallet}.`);
                }

                insertHistory.run(
                    wallet,
                    current.state || null,
                    state,
                    String(item.reason || 'background-refresh'),
                    version,
                    classifiedAt,
                    snapshotTimestamp
                );

                updateHolder.run(
                    state,
                    classifiedAt,
                    version,
                    wallet
                );

                deleteQueue.run(wallet);
                updated += 1;
            }

            return updated;
        });

        return tx();
    }

    failClassificationJobs(wallets, errorMessage, nextAttemptAtMs) {
        if (!Array.isArray(wallets) || wallets.length === 0) return 0;

        const nextAt = Number(nextAttemptAtMs);
        if (!Number.isFinite(nextAt)) {
            throw new TypeError('nextAttemptAtMs must be finite.');
        }

        const tx = this.db.transaction(() => {
            const update = this.db.prepare(`
                UPDATE classification_queue
                SET
                    status = 'failed',
                    available_at_ms = ?,
                    locked_at_ms = NULL,
                    last_error = ?,
                    updated_at_ms = ?
                WHERE wallet = ?
            `);
            let changes = 0;
            const now = Date.now();
            for (const wallet of new Set(wallets.map(value => String(value || '').trim()).filter(Boolean))) {
                changes += update.run(
                    nextAt,
                    String(errorMessage || 'Classification failed.'),
                    now,
                    wallet
                ).changes;
            }
            return changes;
        });

        return tx();
    }

    getClassificationSummary() {
        const row = this.db.prepare(`
            SELECT
                COUNT(*) AS totalHolders,
                SUM(CASE WHEN activity = 'active' AND state = 'user' THEN 1 ELSE 0 END) AS userHolders,
                SUM(CASE WHEN activity = 'active' AND state = 'program' THEN 1 ELSE 0 END) AS programHolders,
                SUM(CASE WHEN activity = 'active' AND state = 'unknown' THEN 1 ELSE 0 END) AS unknownHolders,
                SUM(CASE WHEN activity = 'active' AND classification_updated_ms IS NULL THEN 1 ELSE 0 END) AS neverClassified,
                SUM(CASE WHEN activity = 'active' THEN 1 ELSE 0 END) AS activeHolders
            FROM holders_list
        `).get();

        const queue = this.db.prepare(`
            SELECT
                COUNT(*) AS queued,
                SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS inProgress,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
            FROM classification_queue
        `).get();

        return {
            totalHolders: Number(row?.totalHolders || 0),
            activeHolders: Number(row?.activeHolders || 0),
            userHolders: Number(row?.userHolders || 0),
            programHolders: Number(row?.programHolders || 0),
            unknownHolders: Number(row?.unknownHolders || 0),
            neverClassified: Number(row?.neverClassified || 0),
            queue: Number(queue?.queued || 0),
            inProgress: Number(queue?.inProgress || 0),
            failed: Number(queue?.failed || 0)
        };
    }

    rebuildRankingsAndTop100(snapshotTimestamp) {
        if (!snapshotTimestamp) {
            throw new TypeError('snapshotTimestamp is required.');
        }

        const tx = this.db.transaction(() => {
            this.statements.clearRankings.run();
            this.statements.insertRankings.run({
                snapshotTimestamp: String(snapshotTimestamp)
            });

            this.statements.clearTop100.run();
            this.statements.insertTop100.run();

            const eligible = Number(this.db.prepare(`
                SELECT COUNT(*) AS count
                FROM holders_list
                WHERE state = 'user'
                  AND activity = 'active'
                  AND raw_amount <> '0'
            `).get()?.count || 0);

            const top100Count = Number(
                this.statements.getTop100Count.get()?.count || 0
            );

            const integrity = this.statements.getTop100Integrity.get();
            const expected = Math.min(eligible, 100);
            if (top100Count !== expected) {
                throw new Error(
                    `Ranking validation failed: top100=${top100Count}, expected=${expected}.`
                );
            }

            if (
                Number(integrity?.count || 0) !== top100Count ||
                Number(integrity?.distinct_wallets || 0) !== top100Count ||
                (top100Count > 0 && Number(integrity?.min_rank || 0) !== 1) ||
                Number(integrity?.max_rank || 0) !== top100Count ||
                Number(integrity?.invalid_states || 0) !== 0
            ) {
                throw new Error('Ranking validation failed: Top 100 integrity check failed.');
            }

            const unknownCount = Number(this.db.prepare(`
                SELECT COUNT(*) AS count
                FROM holders_list
                WHERE state = 'unknown' AND activity = 'active'
            `).get()?.count || 0);

            return {
                snapshotTimestamp: String(snapshotTimestamp),
                eligibleUsers: eligible,
                top100Count,
                unknownCount
            };
        });

        return tx();
    }

    getRankingSummary() {
        const count = this.db.prepare(`
            SELECT COUNT(*) AS count FROM holder_rankings
        `).get();
        const latest = this.db.prepare(`
            SELECT MAX(snapshot_timestamp) AS snapshotTimestamp
            FROM holder_rankings
        `).get();
        return {
            rankedHolders: Number(count?.count || 0),
            snapshotTimestamp: latest?.snapshotTimestamp || null,
            top100Count: Number(this.statements.getTop100Count.get()?.count || 0)
        };
    }

    getClassificationHistory(wallet, limit = 50) {
        const normalizedWallet = this._normalizeWallet(wallet);
        const safeLimit = Number.isInteger(limit) && limit > 0
            ? Math.min(limit, 500)
            : 50;

        return this.db.prepare(`
            SELECT
                id,
                wallet,
                previous_state AS previousState,
                new_state AS newState,
                reason,
                classification_version AS classificationVersion,
                checked_at_ms AS checkedAtMs,
                snapshot_timestamp AS snapshotTimestamp
            FROM holder_classification_history
            WHERE wallet = ?
            ORDER BY checked_at_ms DESC, id DESC
            LIMIT ?
        `).all(normalizedWallet, safeLimit);
    }

    // =============================================================
    // Close
    // =============================================================

    close() {
        this._classificationLookupStatements.clear();

        if (this.db && this.db.open) {
            this.db.close();
        }
    }
}

module.exports = HolderDatabase;
