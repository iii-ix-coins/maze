'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DEFAULT_TOTAL_TRANSACTIONS = 0;
const DEFAULT_SCAN_COMPLETED = false;

const DEFAULT_SOURCE = 'unknown';
const DEFAULT_TYPE = 'TRANSFER';
const DEFAULT_DETECTED_VIA = 'unknown';

class TxDatabase {
    constructor(dbPath) {
        if (
            typeof dbPath !== 'string' ||
            dbPath.trim() === ''
        ) {
            throw new TypeError(
                'Database path is required.'
            );
        }

        const resolvedPath = path.resolve(dbPath);
        const dir = path.dirname(resolvedPath);

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, {
                recursive: true
            });
        }

        this.db = new Database(resolvedPath);
        this.closed = false;
        this.statements = {};

        /*
         * SQLite runtime configuration.
         *
         * WAL:
         * - allows readers while writer is active
         *
         * NORMAL:
         * - good throughput / durability balance
         *
         * foreign_keys:
         * - future-proofing
         *
         * busy_timeout:
         * - tolerate short concurrent lock contention
         */
        this.db.pragma(
            'journal_mode = WAL'
        );

        this.db.pragma(
            'synchronous = NORMAL'
        );

        this.db.pragma(
            'foreign_keys = ON'
        );

        this.db.pragma(
            'busy_timeout = 5000'
        );

        this.initTables();
    }

    /*
     * =============================================
     * Lifecycle
     * =============================================
     */

    isOpen() {
        return (
            !this.closed &&
            Boolean(this.db)
        );
    }

    assertOpen() {
        if (!this.isOpen()) {
            throw new Error(
                'Transaction database is closed.'
            );
        }
    }

    close() {
        if (this.closed) {
            return;
        }

        this.closed = true;
        this.statements = {};

        if (this.db) {
            try {
                this.db.close();
            } finally {
                this.db = null;
            }
        }
    }

    /*
     * =============================================
     * Schema
     * =============================================
     */

    initTables() {
        this.assertOpen();

        /*
         * Historical scanner state.
         *
         * IMPORTANT:
         * realtime websocket ingestion does not
         * advance this cursor directly.
         */
        this.db.prepare(`
            CREATE TABLE IF NOT EXISTS tx_state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                updatedAt TEXT,
                mintAddress TEXT,
                lastSignature TEXT,
                oldestSignature TEXT,
                scanCursorSignature TEXT,
                scanHeadSignature TEXT,
                totalTransactions INTEGER DEFAULT 0,
                scanCompleted INTEGER DEFAULT 0
            )
        `).run();

        this.db.prepare(`
            INSERT OR IGNORE INTO tx_state (
                id,
                totalTransactions,
                scanCompleted
            )
            VALUES (
                1,
                0,
                0
            )
        `).run();

        // Safe schema migration for existing transactions.db files.
        this.#ensureColumn(
            'tx_state',
            'scanCursorSignature',
            'TEXT'
        );

        this.#ensureColumn(
            'tx_state',
            'scanHeadSignature',
            'TEXT'
        );

        /*
         * Buyer records.
         *
         * Existing schema intentionally preserved.
         */
        this.db.prepare(`
            CREATE TABLE IF NOT EXISTS buyers (
                signature TEXT PRIMARY KEY,
                blockTime INTEGER NOT NULL,
                buyerWallet TEXT NOT NULL,
                amountBought REAL NOT NULL,
                payments TEXT NOT NULL,
                isPaidPurchase INTEGER,
                source TEXT,
                type TEXT,
                detectedVia TEXT
            )
        `).run();

        /*
         * Raw transaction store.
         */
        this.db.prepare(`
            CREATE TABLE IF NOT EXISTS raw_transactions (
                signature TEXT PRIMARY KEY,
                blockTime INTEGER,
                slot INTEGER,
                raw_data TEXT
            )
        `).run();

        /*
         * Backward-compatible schema upgrades.
         */
        this.#ensureColumn(
            'raw_transactions',
            'slot',
            'INTEGER'
        );

        this.#ensureColumn(
            'raw_transactions',
            'ingestion_source',
            'TEXT'
        );

        this.#ensureColumn(
            'raw_transactions',
            'ingested_at',
            'TEXT'
        );

        /*
         * Indexes.
         */
        this.db.prepare(`
            CREATE INDEX IF NOT EXISTS idx_buyers_time
            ON buyers(blockTime DESC)
        `).run();

        this.db.prepare(`
            CREATE INDEX IF NOT EXISTS idx_buyers_wallet_paid_time
            ON buyers(buyerWallet, isPaidPurchase, blockTime ASC, signature ASC)
        `).run();

        this.db.prepare(`
            CREATE INDEX IF NOT EXISTS idx_raw_time
            ON raw_transactions(blockTime DESC)
        `).run();

        this.db.prepare(`
            CREATE INDEX IF NOT EXISTS idx_raw_slot
            ON raw_transactions(slot DESC)
        `).run();

        this.db.prepare(`
            CREATE INDEX IF NOT EXISTS idx_raw_source
            ON raw_transactions(ingestion_source)
        `).run();
    }

    #ensureColumn(
        tableName,
        columnName,
        columnDefinition
    ) {
        this.assertOpen();

        const columns =
            this.db
                .prepare(
                    `PRAGMA table_info(${tableName})`
                )
                .all();

        const exists =
            columns.some(
                column =>
                    column.name === columnName
            );

        if (exists) {
            return;
        }

        this.db.prepare(`
            ALTER TABLE ${tableName}
            ADD COLUMN ${columnName} ${columnDefinition}
        `).run();
    }

    /*
     * =============================================
     * Prepared statements
     * =============================================
     */

    #getStatement(
        name,
        sql
    ) {
        this.assertOpen();

        if (!this.statements[name]) {
            this.statements[name] =
                this.db.prepare(sql);
        }

        return this.statements[name];
    }

    /*
     * =============================================
     * State
     * =============================================
     */

    getState() {
        this.assertOpen();

        const row =
            this.#getStatement(
                'getState',
                `
                    SELECT
                        id,
                        updatedAt,
                        mintAddress,
                        lastSignature,
                        oldestSignature,
                        scanCursorSignature,
                        scanHeadSignature,
                        totalTransactions,
                        scanCompleted
                    FROM tx_state
                    WHERE id = 1
                `
            ).get();

        return {
            version: 1,

            updatedAt:
                row?.updatedAt ?? null,

            mintAddress:
                row?.mintAddress ?? null,

            lastSignature:
                row?.lastSignature ?? null,

            oldestSignature:
                row?.oldestSignature ?? null,

            scanCursorSignature:
                row?.scanCursorSignature ?? null,

            scanHeadSignature:
                row?.scanHeadSignature ?? null,

            totalTransactions:
                Number.isSafeInteger(
                    row?.totalTransactions
                )
                    ? row.totalTransactions
                    : DEFAULT_TOTAL_TRANSACTIONS,

            scanCompleted:
                row?.scanCompleted === 1
                    ? true
                    : DEFAULT_SCAN_COMPLETED
        };
    }

    updateState(state = {}) {
        this.assertOpen();

        if (
            !state ||
            typeof state !== 'object' ||
            Array.isArray(state)
        ) {
            throw new TypeError(
                'Transaction state must be an object.'
            );
        }

        const current = this.getState();

        const next = {
            ...current,
            ...state
        };

        const numericTotal =
            Number(
                next.totalTransactions
            );

        const safeTotal =
            Number.isFinite(numericTotal) &&
            numericTotal >= 0
                ? Math.trunc(numericTotal)
                : DEFAULT_TOTAL_TRANSACTIONS;

        this.#getStatement(
            'updateState',
            `
                UPDATE tx_state
                SET
                    updatedAt = ?,
                    mintAddress = ?,
                    lastSignature = ?,
                    oldestSignature = ?,
                    scanCursorSignature = ?,
                    scanHeadSignature = ?,
                    totalTransactions = ?,
                    scanCompleted = ?
                WHERE id = 1
            `
        ).run(
            next.updatedAt ||
                new Date().toISOString(),

            next.mintAddress ||
                null,

            next.lastSignature ||
                null,

            next.oldestSignature ||
                null,

            next.scanCursorSignature ||
                null,

            next.scanHeadSignature ||
                null,

            safeTotal,

            next.scanCompleted
                ? 1
                : 0
        );

        return this.getState();
    }

    syncStateWithLatestRaw(mintAddress) {
        this.assertOpen();

        const row =
            this.#getStatement(
                'latestRawForState',
                `
                    SELECT
                        signature,
                        blockTime,
                        slot
                    FROM raw_transactions
                    ORDER BY
                        slot DESC,
                        blockTime DESC
                    LIMIT 1
                `
            ).get();

        if (
            !row ||
            !row.signature
        ) {
            return null;
        }

        const current = this.getState();

        this.updateState({
            updatedAt:
                new Date().toISOString(),

            mintAddress:
                mintAddress ||
                current.mintAddress,

            lastSignature:
                row.signature,

            scanCursorSignature:
                null,

            scanHeadSignature:
                null,

            scanCompleted:
                true
        });

        return row.signature;
    }

    /*
     * =============================================
     * Raw transaction helpers
     * =============================================
     */

    #extractRawTransaction(item) {
        if (
            !item ||
            typeof item !== 'object'
        ) {
            return null;
        }

        if (
            item.raw &&
            typeof item.raw === 'object'
        ) {
            return item.raw;
        }

        return item;
    }

    #extractSignature(
        item,
        raw
    ) {
        const direct =
            item?.signature;

        if (
            typeof direct === 'string' &&
            direct.trim() !== ''
        ) {
            return direct.trim();
        }

        const rawDirect =
            raw?.signature;

        if (
            typeof rawDirect === 'string' &&
            rawDirect.trim() !== ''
        ) {
            return rawDirect.trim();
        }

        const nested =
            raw?.transaction
                ?.signatures
                ?.[0];

        if (
            typeof nested === 'string' &&
            nested.trim() !== ''
        ) {
            return nested.trim();
        }

        const alternate =
            raw?.signatures;

        if (
            Array.isArray(alternate) &&
            typeof alternate[0] === 'string' &&
            alternate[0].trim() !== ''
        ) {
            return alternate[0].trim();
        }

        return null;
    }

    hasRawTransaction(signature) {
        this.assertOpen();

        if (
            typeof signature !== 'string' ||
            signature.trim() === ''
        ) {
            return false;
        }

        const row =
            this.#getStatement(
                'hasRawTransaction',
                `
                    SELECT 1
                    FROM raw_transactions
                    WHERE signature = ?
                    LIMIT 1
                `
            ).get(
                signature.trim()
            );

        return Boolean(row);
    }

    getRawTransaction(signature) {
        this.assertOpen();

        if (
            typeof signature !== 'string' ||
            signature.trim() === ''
        ) {
            return null;
        }

        const row =
            this.#getStatement(
                'getRawTransaction',
                `
                    SELECT
                        signature,
                        blockTime,
                        slot,
                        raw_data,
                        ingestion_source,
                        ingested_at
                    FROM raw_transactions
                    WHERE signature = ?
                    LIMIT 1
                `
            ).get(
                signature.trim()
            );

        if (!row) {
            return null;
        }

        let raw = null;

        try {
            raw = JSON.parse(
                row.raw_data || 'null'
            );
        } catch {
            raw = null;
        }

        return {
            signature:
                row.signature,

            blockTime:
                row.blockTime,

            slot:
                row.slot,

            ingestionSource:
                row.ingestion_source ||
                DEFAULT_SOURCE,

            ingestedAt:
                row.ingested_at ||
                null,

            raw
        };
    }

    getLatestRawTransaction() {
        this.assertOpen();

        const row =
            this.#getStatement(
                'getLatestRawTransaction',
                `
                    SELECT
                        signature,
                        blockTime,
                        slot,
                        raw_data,
                        ingestion_source,
                        ingested_at
                    FROM raw_transactions
                    ORDER BY
                        slot DESC,
                        blockTime DESC
                    LIMIT 1
                `
            ).get();

        if (!row) {
            return null;
        }

        let raw = null;

        try {
            raw = JSON.parse(
                row.raw_data || 'null'
            );
        } catch {
            raw = null;
        }

        return {
            signature:
                row.signature,

            blockTime:
                row.blockTime,

            slot:
                row.slot,

            ingestionSource:
                row.ingestion_source ||
                DEFAULT_SOURCE,

            ingestedAt:
                row.ingested_at ||
                null,

            raw
        };
    }

    /*
     * =============================================
     * Raw persistence
     * =============================================
     */

    insertRawTransactionsBatch(txArray) {
        this.assertOpen();

        if (!Array.isArray(txArray)) {
            throw new TypeError(
                'txArray must be an array.'
            );
        }

        if (txArray.length === 0) {
            return {
                received: 0,
                inserted: 0,
                duplicates: 0,
                invalid: 0,
                signatures: []
            };
        }

        const stmt =
            this.#getStatement(
                'insertRawTransaction',
                `
                    INSERT OR IGNORE INTO raw_transactions
                    (
                        signature,
                        blockTime,
                        slot,
                        raw_data,
                        ingestion_source,
                        ingested_at
                    )
                    VALUES
                    (
                        @signature,
                        @blockTime,
                        @slot,
                        @raw_data,
                        @ingestion_source,
                        @ingested_at
                    )
                `
            );

        let inserted = 0;
        let duplicates = 0;
        let invalid = 0;

        const signatures = [];

        const insertMany =
            this.db.transaction(
                items => {
                    for (const item of items) {
                        if (
                            !item ||
                            typeof item !== 'object'
                        ) {
                            invalid++;
                            continue;
                        }

                        const raw =
                            this.#extractRawTransaction(
                                item
                            );

                        if (!raw) {
                            invalid++;
                            continue;
                        }

                        const signature =
                            this.#extractSignature(
                                item,
                                raw
                            );

                        if (!signature) {
                            invalid++;
                            continue;
                        }

                        const blockTime =
                            Number(
                                item.blockTime ??
                                raw.blockTime ??
                                raw.timestamp ??
                                0
                            ) || 0;

                        const slotValue =
                            Number(
                                item.slot ??
                                raw.slot ??
                                0
                            );

                        const slot =
                            Number.isSafeInteger(
                                slotValue
                            )
                                ? slotValue
                                : 0;

                        const ingestion =
                            item.ingestion &&
                            typeof item.ingestion === 'object'
                                ? item.ingestion
                                : {};

                        const source =
                            typeof ingestion.source === 'string' &&
                            ingestion.source.trim() !== ''
                                ? ingestion.source.trim()
                                : DEFAULT_SOURCE;

                        const ingestedAt =
                            typeof ingestion.ingestedAt === 'string' &&
                            ingestion.ingestedAt.trim() !== ''
                                ? ingestion.ingestedAt.trim()
                                : new Date().toISOString();

                        const result =
                            stmt.run({
                                signature,

                                blockTime,

                                slot,

                                raw_data:
                                    JSON.stringify(
                                        raw
                                    ),

                                ingestion_source:
                                    source,

                                ingested_at:
                                    ingestedAt
                            });

                        signatures.push(signature);

                        if (
                            result.changes === 1
                        ) {
                            inserted++;
                        } else {
                            duplicates++;
                        }
                    }
                }
            );

        insertMany(txArray);

        return {
            received:
                txArray.length,

            inserted,

            duplicates,

            invalid,

            signatures
        };
    }

    /*
     * =============================================
     * Atomic raw + buyers persistence
     * =============================================
     *
     * This is the preferred PRO writer path.
     *
     * One SQLite transaction:
     *
     * BEGIN
     *   raw transactions
     *   buyer records
     * COMMIT
     *
     * If the transaction throws, SQLite rolls
     * everything back.
     */

    persistRawTransactionsAndBuyersBatch(
        txArray,
        buyersArray = []
    ) {
        this.assertOpen();

        if (!Array.isArray(txArray)) {
            throw new TypeError(
                'txArray must be an array.'
            );
        }

        if (!Array.isArray(buyersArray)) {
            throw new TypeError(
                'buyersArray must be an array.'
            );
        }

        if (
            txArray.length === 0 &&
            buyersArray.length === 0
        ) {
            return {
                raw: {
                    received: 0,
                    inserted: 0,
                    duplicates: 0,
                    invalid: 0,
                    signatures: []
                },

                buyers: {
                    received: 0,
                    inserted: 0,
                    duplicates: 0,
                    invalid: 0
                }
            };
        }

        const rawStmt =
            this.#getStatement(
                'atomicInsertRawTransaction',
                `
                    INSERT OR IGNORE INTO raw_transactions
                    (
                        signature,
                        blockTime,
                        slot,
                        raw_data,
                        ingestion_source,
                        ingested_at
                    )
                    VALUES
                    (
                        @signature,
                        @blockTime,
                        @slot,
                        @raw_data,
                        @ingestion_source,
                        @ingested_at
                    )
                `
            );

        const buyerStmt =
            this.#getStatement(
                'atomicInsertBuyer',
                `
                    INSERT OR IGNORE INTO buyers
                    (
                        signature,
                        blockTime,
                        buyerWallet,
                        amountBought,
                        payments,
                        isPaidPurchase,
                        source,
                        type,
                        detectedVia
                    )
                    VALUES
                    (
                        @signature,
                        @blockTime,
                        @buyerWallet,
                        @amountBought,
                        @payments,
                        @isPaidPurchase,
                        @source,
                        @type,
                        @detectedVia
                    )
                `
            );

        let rawInserted = 0;
        let rawDuplicates = 0;
        let rawInvalid = 0;
        const rawSignatures = [];

        let buyerInserted = 0;
        let buyerDuplicates = 0;
        let buyerInvalid = 0;

        const transaction =
            this.db.transaction(
                (
                    rawItems,
                    buyerItems
                ) => {
                    for (const item of rawItems) {
                        if (
                            !item ||
                            typeof item !== 'object'
                        ) {
                            rawInvalid++;
                            continue;
                        }

                        const raw =
                            this.#extractRawTransaction(
                                item
                            );

                        if (!raw) {
                            rawInvalid++;
                            continue;
                        }

                        const signature =
                            this.#extractSignature(
                                item,
                                raw
                            );

                        if (!signature) {
                            rawInvalid++;
                            continue;
                        }

                        const blockTime =
                            Number(
                                item.blockTime ??
                                raw.blockTime ??
                                raw.timestamp ??
                                0
                            ) || 0;

                        const slotValue =
                            Number(
                                item.slot ??
                                raw.slot ??
                                0
                            );

                        const slot =
                            Number.isSafeInteger(
                                slotValue
                            )
                                ? slotValue
                                : 0;

                        const ingestion =
                            item.ingestion &&
                            typeof item.ingestion === 'object'
                                ? item.ingestion
                                : {};

                        const source =
                            typeof ingestion.source === 'string' &&
                            ingestion.source.trim() !== ''
                                ? ingestion.source.trim()
                                : DEFAULT_SOURCE;

                        const ingestedAt =
                            typeof ingestion.ingestedAt === 'string' &&
                            ingestion.ingestedAt.trim() !== ''
                                ? ingestion.ingestedAt.trim()
                                : new Date().toISOString();

                        const result =
                            rawStmt.run({
                                signature,

                                blockTime,

                                slot,

                                raw_data:
                                    JSON.stringify(
                                        raw
                                    ),

                                ingestion_source:
                                    source,

                                ingested_at:
                                    ingestedAt
                            });

                        rawSignatures.push(
                            signature
                        );

                        if (
                            result.changes === 1
                        ) {
                            rawInserted++;
                        } else {
                            rawDuplicates++;
                        }
                    }

                    for (
                        const item
                        of buyerItems
                    ) {
                        if (
                            !item ||
                            typeof item !== 'object'
                        ) {
                            buyerInvalid++;
                            continue;
                        }

                        const signature =
                            typeof item.signature === 'string'
                                ? item.signature.trim()
                                : '';

                        const buyerWallet =
                            typeof item.buyerWallet === 'string'
                                ? item.buyerWallet.trim()
                                : '';

                        if (
                            !signature ||
                            !buyerWallet
                        ) {
                            buyerInvalid++;
                            continue;
                        }

                        const amountBought =
                            Number(
                                item.amountBought
                            );

                        const normalizedAmount =
                            Number.isFinite(
                                amountBought
                            )
                                ? amountBought
                                : 0;

                        const payments =
                            Array.isArray(
                                item.payments
                            )
                                ? item.payments
                                : [];

                        const result =
                            buyerStmt.run({
                                signature,

                                blockTime:
                                    Number(
                                        item.blockTime
                                    ) || 0,

                                buyerWallet,

                                amountBought:
                                    normalizedAmount,

                                payments:
                                    JSON.stringify(
                                        payments
                                    ),

                                isPaidPurchase:
                                    item.isPaidPurchase
                                        ? 1
                                        : 0,

                                source:
                                    typeof item.source === 'string' &&
                                    item.source.trim() !== ''
                                        ? item.source.trim()
                                        : DEFAULT_SOURCE,

                                type:
                                    typeof item.type === 'string' &&
                                    item.type.trim() !== ''
                                        ? item.type.trim()
                                        : DEFAULT_TYPE,

                                detectedVia:
                                    typeof item.detectedVia === 'string' &&
                                    item.detectedVia.trim() !== ''
                                        ? item.detectedVia.trim()
                                        : DEFAULT_DETECTED_VIA
                            });

                        if (
                            result.changes === 1
                        ) {
                            buyerInserted++;
                        } else {
                            buyerDuplicates++;
                        }
                    }
                }
            );

        transaction(
            txArray,
            buyersArray
        );

        return {
            raw: {
                received:
                    txArray.length,

                inserted:
                    rawInserted,

                duplicates:
                    rawDuplicates,

                invalid:
                    rawInvalid,

                signatures:
                    rawSignatures
            },

            buyers: {
                received:
                    buyersArray.length,

                inserted:
                    buyerInserted,

                duplicates:
                    buyerDuplicates,

                invalid:
                    buyerInvalid
            }
        };
    }

    /*
     * =============================================
     * Buyer persistence
     * =============================================
     */

    insertBuyersBatch(buyersArray) {
        this.assertOpen();

        if (!Array.isArray(buyersArray)) {
            throw new TypeError(
                'buyersArray must be an array.'
            );
        }

        if (buyersArray.length === 0) {
            return {
                received: 0,
                inserted: 0,
                duplicates: 0,
                invalid: 0
            };
        }

        const stmt =
            this.#getStatement(
                'insertBuyer',
                `
                    INSERT OR IGNORE INTO buyers
                    (
                        signature,
                        blockTime,
                        buyerWallet,
                        amountBought,
                        payments,
                        isPaidPurchase,
                        source,
                        type,
                        detectedVia
                    )
                    VALUES
                    (
                        @signature,
                        @blockTime,
                        @buyerWallet,
                        @amountBought,
                        @payments,
                        @isPaidPurchase,
                        @source,
                        @type,
                        @detectedVia
                    )
                `
            );

        let inserted = 0;
        let duplicates = 0;
        let invalid = 0;

        const insertMany =
            this.db.transaction(
                items => {
                    for (const item of items) {
                        if (
                            !item ||
                            typeof item !== 'object'
                        ) {
                            invalid++;
                            continue;
                        }

                        const signature =
                            typeof item.signature === 'string'
                                ? item.signature.trim()
                                : '';

                        const buyerWallet =
                            typeof item.buyerWallet === 'string'
                                ? item.buyerWallet.trim()
                                : '';

                        if (
                            !signature ||
                            !buyerWallet
                        ) {
                            invalid++;
                            continue;
                        }

                        const amountBought =
                            Number(
                                item.amountBought
                            );

                        const normalizedAmount =
                            Number.isFinite(
                                amountBought
                            )
                                ? amountBought
                                : 0;

                        const payments =
                            Array.isArray(
                                item.payments
                            )
                                ? item.payments
                                : [];

                        const result =
                            stmt.run({
                                signature,

                                blockTime:
                                    Number(
                                        item.blockTime
                                    ) || 0,

                                buyerWallet,

                                amountBought:
                                    normalizedAmount,

                                payments:
                                    JSON.stringify(
                                        payments
                                    ),

                                isPaidPurchase:
                                    item.isPaidPurchase
                                        ? 1
                                        : 0,

                                source:
                                    typeof item.source === 'string' &&
                                    item.source.trim() !== ''
                                        ? item.source.trim()
                                        : DEFAULT_SOURCE,

                                type:
                                    typeof item.type === 'string' &&
                                    item.type.trim() !== ''
                                        ? item.type.trim()
                                        : DEFAULT_TYPE,

                                detectedVia:
                                    typeof item.detectedVia === 'string' &&
                                    item.detectedVia.trim() !== ''
                                        ? item.detectedVia.trim()
                                        : DEFAULT_DETECTED_VIA
                            });

                        if (
                            result.changes === 1
                        ) {
                            inserted++;
                        } else {
                            duplicates++;
                        }
                    }
                }
            );

        insertMany(buyersArray);

        return {
            received:
                buyersArray.length,

            inserted,

            duplicates,

            invalid
        };
    }

    /*
     * =============================================
     * Buyer queries
     * =============================================
     */

    getLatestBuyers(limit = 50) {
        this.assertOpen();

        const safeLimit =
            Number.isInteger(limit) &&
            limit > 0
                ? limit
                : 50;

        const rows =
            this.#getStatement(
                'getLatestBuyers',
                `
                    SELECT
                        signature,
                        blockTime,
                        buyerWallet,
                        amountBought,
                        payments,
                        isPaidPurchase,
                        source,
                        type,
                        detectedVia
                    FROM buyers
                    WHERE isPaidPurchase = 1
                    ORDER BY
                        blockTime DESC,
                        signature DESC
                    LIMIT ?
                `
            ).all(
                safeLimit
            );

        return rows.map(
            row => {
                let payments = [];

                try {
                    payments =
                        JSON.parse(
                            row.payments ||
                            '[]'
                        );
                } catch {
                    payments = [];
                }

                return {
                    signature:
                        row.signature,

                    blockTime:
                        row.blockTime,

                    buyerWallet:
                        row.buyerWallet,

                    amountBought:
                        row.amountBought,

                    payments,

                    isPaidPurchase:
                        row.isPaidPurchase === 1,

                    source:
                        row.source ||
                        DEFAULT_SOURCE,

                    type:
                        row.type ||
                        DEFAULT_TYPE,

                    detectedVia:
                        row.detectedVia ||
                        DEFAULT_DETECTED_VIA
                };
            }
        );
    }

    hasBuyer(signature) {
        this.assertOpen();

        if (
            typeof signature !== 'string' ||
            signature.trim() === ''
        ) {
            return false;
        }

        const row =
            this.#getStatement(
                'hasBuyer',
                `
                    SELECT 1
                    FROM buyers
                    WHERE signature = ?
                    LIMIT 1
                `
            ).get(
                signature.trim()
            );

        return Boolean(row);
    }

    /*
     * =============================================
     * Counts / health
     * =============================================
     */

    getCounts() {
        this.assertOpen();

        const raw =
            this.#getStatement(
                'countRaw',
                `
                    SELECT COUNT(*) AS count
                    FROM raw_transactions
                `
            ).get();

        const buyers =
            this.#getStatement(
                'countBuyers',
                `
                    SELECT COUNT(*) AS count
                    FROM buyers
                `
            ).get();

        return {
            rawTransactions:
                Number(raw?.count) || 0,

            buyers:
                Number(buyers?.count) || 0
        };
    }

    health() {
        this.assertOpen();

        const integrity =
            this.db
                .prepare(
                    'PRAGMA integrity_check'
                )
                .get();

        return {
            open:
                this.isOpen(),

            integrity:
                integrity?.integrity_check ===
                'ok',

            counts:
                this.getCounts(),

            state:
                this.getState()
        };
    }

    /*
     * =============================================
     * Explicit DB transaction helper
     * =============================================
     */

    transaction(callback) {
        this.assertOpen();

        if (
            typeof callback !== 'function'
        ) {
            throw new TypeError(
                'Transaction callback must be a function.'
            );
        }

        const transaction =
            this.db.transaction(
                callback
            );

        return transaction.apply(
            null,
            Array.prototype.slice.call(
                arguments,
                1
            )
        );
    }
}

module.exports =
    TxDatabase;
