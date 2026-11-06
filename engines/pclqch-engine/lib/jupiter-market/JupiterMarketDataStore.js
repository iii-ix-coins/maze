'use strict';

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

class JupiterMarketDataStore {
    constructor({
        dbPath,
        historyEnabled = true,
        historyRetentionDays = 30
    } = {}) {
        if (!dbPath || typeof dbPath !== 'string') {
            throw new TypeError('dbPath must be a non-empty string.');
        }

        const dir = path.dirname(dbPath);
        fs.mkdirSync(dir, { recursive: true });

        this.db = new Database(dbPath);
        this.historyEnabled = Boolean(historyEnabled);
        this.historyRetentionDays = Math.max(
            Number(historyRetentionDays) || 30,
            1
        );
        this.historyCleanupIntervalMs = 60 * 60 * 1000;
        this.lastHistoryCleanupAt = 0;

        this.db.pragma('journal_mode = WAL');
        this.db.pragma('synchronous = NORMAL');
        this.db.pragma('busy_timeout = 10000');

        this._prepareSchema();
        this._prepareStatements();
    }

    _prepareSchema() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS jupiter_market_current (
                mint_address TEXT PRIMARY KEY,
                fetched_at_ms INTEGER NOT NULL,
                fetched_at TEXT NOT NULL,

                price_usd TEXT,
                price_v3_usd TEXT,
                price_v3_block_id INTEGER,
                price_v3_decimals INTEGER,
                price_v3_change_24h REAL,

                token_updated_at TEXT,
                name TEXT,
                symbol TEXT,
                icon TEXT,
                decimals INTEGER,
                circ_supply TEXT,
                total_supply TEXT,
                token_program TEXT,
                holder_count INTEGER,

                organic_score REAL,
                organic_score_label TEXT,
                is_verified INTEGER,

                fdv_usd TEXT,
                mcap_usd TEXT,
                liquidity_usd TEXT,

                first_pool_json TEXT,
                audit_json TEXT,
                tags_json TEXT,
                stats_5m_json TEXT,
                stats_1h_json TEXT,
                stats_6h_json TEXT,
                stats_24h_json TEXT,

                raw_price_v3_json TEXT,
                raw_tokens_v2_json TEXT,
                normalized_json TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS jupiter_market_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                mint_address TEXT NOT NULL,
                fetched_at_ms INTEGER NOT NULL,
                fetched_at TEXT NOT NULL,
                normalized_json TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_jupiter_market_history_mint_time
                ON jupiter_market_history(mint_address, fetched_at_ms DESC);
        `);
    }

    _prepareStatements() {
        this.statements = {
            upsertCurrent: this.db.prepare(`
                INSERT INTO jupiter_market_current (
                    mint_address,
                    fetched_at_ms,
                    fetched_at,
                    price_usd,
                    price_v3_usd,
                    price_v3_block_id,
                    price_v3_decimals,
                    price_v3_change_24h,
                    token_updated_at,
                    name,
                    symbol,
                    icon,
                    decimals,
                    circ_supply,
                    total_supply,
                    token_program,
                    holder_count,
                    organic_score,
                    organic_score_label,
                    is_verified,
                    fdv_usd,
                    mcap_usd,
                    liquidity_usd,
                    first_pool_json,
                    audit_json,
                    tags_json,
                    stats_5m_json,
                    stats_1h_json,
                    stats_6h_json,
                    stats_24h_json,
                    raw_price_v3_json,
                    raw_tokens_v2_json,
                    normalized_json
                )
                VALUES (
                    @mintAddress,
                    @fetchedAtMs,
                    @fetchedAt,
                    @priceUsd,
                    @priceV3Usd,
                    @priceV3BlockId,
                    @priceV3Decimals,
                    @priceV3Change24h,
                    @tokenUpdatedAt,
                    @name,
                    @symbol,
                    @icon,
                    @decimals,
                    @circSupply,
                    @totalSupply,
                    @tokenProgram,
                    @holderCount,
                    @organicScore,
                    @organicScoreLabel,
                    @isVerified,
                    @fdvUsd,
                    @mcapUsd,
                    @liquidityUsd,
                    @firstPoolJson,
                    @auditJson,
                    @tagsJson,
                    @stats5mJson,
                    @stats1hJson,
                    @stats6hJson,
                    @stats24hJson,
                    @rawPriceV3Json,
                    @rawTokensV2Json,
                    @normalizedJson
                )
                ON CONFLICT(mint_address)
                DO UPDATE SET
                    fetched_at_ms = excluded.fetched_at_ms,
                    fetched_at = excluded.fetched_at,
                    price_usd = excluded.price_usd,
                    price_v3_usd = excluded.price_v3_usd,
                    price_v3_block_id = excluded.price_v3_block_id,
                    price_v3_decimals = excluded.price_v3_decimals,
                    price_v3_change_24h = excluded.price_v3_change_24h,
                    token_updated_at = excluded.token_updated_at,
                    name = excluded.name,
                    symbol = excluded.symbol,
                    icon = excluded.icon,
                    decimals = excluded.decimals,
                    circ_supply = excluded.circ_supply,
                    total_supply = excluded.total_supply,
                    token_program = excluded.token_program,
                    holder_count = excluded.holder_count,
                    organic_score = excluded.organic_score,
                    organic_score_label = excluded.organic_score_label,
                    is_verified = excluded.is_verified,
                    fdv_usd = excluded.fdv_usd,
                    mcap_usd = excluded.mcap_usd,
                    liquidity_usd = excluded.liquidity_usd,
                    first_pool_json = excluded.first_pool_json,
                    audit_json = excluded.audit_json,
                    tags_json = excluded.tags_json,
                    stats_5m_json = excluded.stats_5m_json,
                    stats_1h_json = excluded.stats_1h_json,
                    stats_6h_json = excluded.stats_6h_json,
                    stats_24h_json = excluded.stats_24h_json,
                    raw_price_v3_json = excluded.raw_price_v3_json,
                    raw_tokens_v2_json = excluded.raw_tokens_v2_json,
                    normalized_json = excluded.normalized_json
            `),

            insertHistory: this.db.prepare(`
                INSERT INTO jupiter_market_history (
                    mint_address,
                    fetched_at_ms,
                    fetched_at,
                    normalized_json
                )
                VALUES (?, ?, ?, ?)
            `),

            deleteOldHistory: this.db.prepare(`
                DELETE FROM jupiter_market_history
                WHERE fetched_at_ms < ?
            `),

            getCurrent: this.db.prepare(`
                SELECT normalized_json
                FROM jupiter_market_current
                WHERE mint_address = ?
            `),

            getHistory: this.db.prepare(`
                SELECT
                    id,
                    mint_address AS mintAddress,
                    fetched_at_ms AS fetchedAtMs,
                    fetched_at AS fetchedAt,
                    normalized_json AS normalizedJson
                FROM jupiter_market_history
                WHERE mint_address = ?
                ORDER BY fetched_at_ms DESC
                LIMIT ?
            `)
        };
    }

    _toDbValue(value) {
        if (value === undefined || value === null) {
            return null;
        }
        return String(value);
    }

    publish(normalized) {
        if (!normalized || typeof normalized !== 'object') {
            throw new TypeError('normalized market data is required.');
        }

        const token = normalized.tokenV2;
        const price = normalized.priceV3;
        const fetchedAtMs = Number(normalized.fetchedAtMs);

        if (!Number.isFinite(fetchedAtMs)) {
            throw new TypeError('normalized.fetchedAtMs must be finite.');
        }

        const params = {
            mintAddress: normalized.mintAddress,
            fetchedAtMs,
            fetchedAt: normalized.fetchedAt,

            priceUsd: this._toDbValue(token?.usdPrice ?? price?.usdPrice),
            priceV3Usd: this._toDbValue(price?.usdPrice),
            priceV3BlockId: price?.blockId ?? null,
            priceV3Decimals: price?.decimals ?? null,
            priceV3Change24h: price?.priceChange24h ?? null,

            tokenUpdatedAt: token?.updatedAt ?? null,
            name: token?.name ?? null,
            symbol: token?.symbol ?? null,
            icon: token?.icon ?? null,
            decimals: token?.decimals ?? null,
            circSupply: this._toDbValue(token?.circSupply),
            totalSupply: this._toDbValue(token?.totalSupply),
            tokenProgram: token?.tokenProgram ?? null,
            holderCount: token?.holderCount ?? null,

            organicScore: token?.organicScore ?? null,
            organicScoreLabel: token?.organicScoreLabel ?? null,
            isVerified:
                typeof token?.isVerified === 'boolean'
                    ? token.isVerified ? 1 : 0
                    : null,

            fdvUsd: this._toDbValue(token?.fdv),
            mcapUsd: this._toDbValue(token?.mcap),
            liquidityUsd: this._toDbValue(token?.liquidity),

            firstPoolJson: token?.firstPool
                ? JSON.stringify(token.firstPool)
                : null,
            auditJson: token?.audit
                ? JSON.stringify(token.audit)
                : null,
            tagsJson: JSON.stringify(token?.tags || []),
            stats5mJson: token?.stats5m
                ? JSON.stringify(token.stats5m)
                : null,
            stats1hJson: token?.stats1h
                ? JSON.stringify(token.stats1h)
                : null,
            stats6hJson: token?.stats6h
                ? JSON.stringify(token.stats6h)
                : null,
            stats24hJson: token?.stats24h
                ? JSON.stringify(token.stats24h)
                : null,

            rawPriceV3Json: JSON.stringify(normalized.raw?.priceV3 ?? null),
            rawTokensV2Json: JSON.stringify(normalized.raw?.tokensV2 ?? null),
            normalizedJson: JSON.stringify(normalized)
        };

        const transaction = this.db.transaction(() => {
            this.statements.upsertCurrent.run(params);

            if (this.historyEnabled) {
                this.statements.insertHistory.run(
                    normalized.mintAddress,
                    fetchedAtMs,
                    normalized.fetchedAt,
                    params.normalizedJson
                );

                const now = Date.now();
                if (
                    now - this.lastHistoryCleanupAt >=
                    this.historyCleanupIntervalMs
                ) {
                    const cutoff =
                        now -
                        this.historyRetentionDays * 24 * 60 * 60 * 1000;

                    this.statements.deleteOldHistory.run(cutoff);
                    this.lastHistoryCleanupAt = now;
                }
            }
        });

        transaction();
    }

    getCurrent(mintAddress) {
        const row = this.statements.getCurrent.get(
            String(mintAddress ?? '').trim()
        );

        if (!row) {
            return null;
        }

        try {
            return JSON.parse(row.normalized_json);
        } catch {
            return null;
        }
    }

    getHistory(mintAddress, limit = 100) {
        const safeLimit =
            Number.isInteger(Number(limit)) && Number(limit) > 0
                ? Math.min(Number(limit), 1000)
                : 100;

        return this.statements.getHistory
            .all(String(mintAddress ?? '').trim(), safeLimit)
            .map(row => ({
                id: row.id,
                mintAddress: row.mintAddress,
                fetchedAtMs: row.fetchedAtMs,
                fetchedAt: row.fetchedAt,
                data: (() => {
                    try {
                        return JSON.parse(row.normalizedJson);
                    } catch {
                        return null;
                    }
                })()
            }));
    }

    close() {
        if (this.db && this.db.open) {
            this.db.close();
        }
    }
}

module.exports = JupiterMarketDataStore;
