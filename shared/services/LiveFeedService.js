'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { readJsonCached } = require('../state/readJsonCached');

/* =========================================================
   DATABASE PATHS
   ========================================================= */

const TX_DB_PATH = path.join(
    __dirname,
    '..',
    '..',
    'engines',
    'tx-engine',
    'data',
    'transactions.db'
);

const HOLDER_DB_PATH = path.join(
    __dirname,
    '..',
    '..',
    'engines',
    'holder-engine',
    'data',
    'holders.db'
);

const HOLDER_STATE_PATH = path.join(
    __dirname,
    '..',
    'state',
    'holder-state.json'
);

/* =========================================================
   LIMITS
   ========================================================= */

const DEFAULT_BUYER_LIMIT = 50;
const DEFAULT_HOLDER_LIMIT = 100;
const MAX_LIMIT = 100;
const HOLDER_FEED_CACHE_MS = 3000;
const holderFeedCache = new Map();

/* =========================================================
   DATABASE INSTANCES
   ========================================================= */

let txDb = null;
let holderDb = null;

/* =========================================================
   TX DATABASE
   ========================================================= */

function getTxDb() {
    if (!txDb) {
        txDb = new Database(
            TX_DB_PATH,
            {
                readonly: true,
                fileMustExist: true
            }
        );

        txDb.pragma(
            'busy_timeout = 5000'
        );
    }

    return txDb;
}

/* =========================================================
   HOLDER DATABASE
   ========================================================= */

function getHolderDb() {
    if (!holderDb) {
        holderDb = new Database(
            HOLDER_DB_PATH,
            {
                readonly: true,
                fileMustExist: true
            }
        );

        holderDb.pragma(
            'busy_timeout = 5000'
        );
    }

    return holderDb;
}

/* =========================================================
   LIMIT HELPER
   ========================================================= */

function clampLimit(
    value,
    fallback
) {
    const parsed =
        Number(value);

    if (
        !Number.isInteger(parsed)
    ) {
        return fallback;
    }

    if (
        parsed < 1
    ) {
        return 1;
    }

    return Math.min(
        parsed,
        MAX_LIMIT
    );
}

/* =========================================================
   LAST 24H BUYERS
   ========================================================= */
function getLatestPurchases(
    options = {}
) {
    const limit =
        clampLimit(
            options.limit,
            DEFAULT_BUYER_LIMIT
        );

    const rows =
        getTxDb()
            .prepare(`
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
                ORDER BY blockTime DESC
                LIMIT ?
            `)
            .all(
                limit
            );

    return {
        type: 'latest-purchases',

        generatedAt:
            new Date().toISOString(),

        items:
            rows.map(
                row => ({
                    signature:
                        row.signature,

                    blockTime:
                        row.blockTime,

                    buyerWallet:
                        row.buyerWallet,

                    amountBought:
                        row.amountBought,

                    payments:
                        parsePayments(
                            row.payments
                        ),

                    isPaidPurchase:
                        Boolean(
                            row.isPaidPurchase
                        ),

                    source:
                        row.source,

                    type:
                        row.type,

                    detectedVia:
                        row.detectedVia
                })
            )
    };
}

/* =========================================================
   PAYMENTS PARSER
   ========================================================= */

function parsePayments(
    value
) {
    if (
        Array.isArray(value)
    ) {
        return value;
    }

    if (
        typeof value !== 'string' ||
        !value.trim()
    ) {
        return [];
    }

    try {
        const parsed =
            JSON.parse(value);

        return Array.isArray(parsed)
            ? parsed
            : [];

    } catch {
        return [];
    }
}

/* =========================================================
   HOLDER STATE
   *
   * Used only for aggregate metadata:
   *   - totalHolders
   *   - totalSupply
   *
   * Top 100 items DO NOT come from this file.
   * ========================================================= */

function readHolderState() {
    const state = readJsonCached(HOLDER_STATE_PATH);
    return state && typeof state === 'object' && !Array.isArray(state) ? state : null;
}

/* =========================================================
   HOLDER PURCHASE STATS
   *
   * Source:
   *   tx-engine/data/transactions.db
   *   -> buyers
   *
   * Only paid purchases are counted.
   *
   * Returns:
   *   purchases
   *   lastPurchaseBlockTime
   * ========================================================= */

function getHolderPurchaseStats(
    wallets
) {
    if (
        !Array.isArray(wallets) ||
        wallets.length === 0
    ) {
        return new Map();
    }

    const uniqueWallets =
        [
            ...new Set(
                wallets.filter(
                    wallet =>
                        typeof wallet === 'string' &&
                        wallet.length > 0
                )
            )
        ];

    if (
        uniqueWallets.length === 0
    ) {
        return new Map();
    }

    const placeholders =
        uniqueWallets
            .map(() => '?')
            .join(',');

    const rows =
        getTxDb()
            .prepare(`
                SELECT
                    buyerWallet,
                    COUNT(DISTINCT signature) AS purchases,
                    MAX(blockTime) AS lastPurchaseBlockTime
                FROM buyers
                WHERE isPaidPurchase = 1
                  AND buyerWallet IN (${placeholders})
                GROUP BY buyerWallet
            `)
            .all(
                ...uniqueWallets
            );

    return new Map(
        rows.map(
            row => [
                row.buyerWallet,
                {
                    purchases:
                        Number(
                            row.purchases
                        ) || 0,

                    lastPurchaseBlockTime:
                        row.lastPurchaseBlockTime == null
                            ? null
                            : Number(
                                row.lastPurchaseBlockTime
                            )
                }
            ]
        )
    );
}

/* =========================================================
   TOP 100 HOLDERS
   *
   * SOURCE OF TRUTH:
   *   engines/holder-engine/data/holders.db
   *   -> "100_top_holders"
   *
   * Purchase statistics are enriched from:
   *   engines/tx-engine/data/transactions.db
   *   -> buyers
   *
   * Existing holder functionality remains unchanged.
   * ========================================================= */

function getTopHolders(
    options = {}
) {
    const limit =
        clampLimit(
            options.limit,
            DEFAULT_HOLDER_LIMIT
        );

    const cached = holderFeedCache.get(limit);
    if (cached && Date.now() - cached.createdAt < HOLDER_FEED_CACHE_MS) return cached.data;

    const db =
        getHolderDb();

    /*
     * Read directly from the materialized
     * Top-100 user-holder table.
     */
    const rows =
        db.prepare(`
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
            LIMIT ?
        `)
            .all(
                limit
            );

    /*
     * Aggregate metadata is still read from
     * the holder state because it represents
     * the latest successful holder snapshot.
     */
    const state =
        readHolderState();

    /*
     * Build wallet list for purchase enrichment.
     */
    const wallets =
        rows.map(
            row => row.wallet
        );

    const purchaseStats =
        getHolderPurchaseStats(
            wallets
        );

    const snapshotTimestamp =
        rows.length > 0
            ? rows[0].snapshotTimestamp
            : (
                state?.data?.timestamp ||
                null
            );

    const payload = {
        type: 'top-holders',

        generatedAt:
            snapshotTimestamp,

        snapshotTimestamp,

        totalHolders:
            state?.data?.totalHolders ??
            null,

        totalSupply:
            state?.data?.totalSupply ??
            null,

        count:
            rows.length,

        items:
            rows.map(
                row => {
                    const purchase =
                        purchaseStats.get(
                            row.wallet
                        );

                    return {
                        rank:
                            row.rank,

                        wallet:
                            row.wallet,

                        rawAmount:
                            row.rawAmount,

                        uiAmount:
                            row.uiAmount,

                        state:
                            row.state,

                        lastUpdatedMs:
                            row.lastUpdatedMs,

                        lastSellAllTime:
                            row.lastSellAllTime,

                        snapshotTimestamp:
                            row.snapshotTimestamp,

                        purchases:
                            purchase?.purchases ??
                            0,

                        lastPurchaseBlockTime:
                            purchase?.lastPurchaseBlockTime ??
                            null
                    };
                }
            )
    };
    holderFeedCache.set(limit, { createdAt: Date.now(), data: payload });
    return payload;
}

/* =========================================================
   CLOSE
   ========================================================= */

function close() {
    if (txDb) {
        try {
            txDb.close();
        } catch {
            // Ignore close errors.
        }

        txDb = null;
    }

    if (holderDb) {
        try {
            holderDb.close();
        } catch {
            // Ignore close errors.
        }

        holderDb = null;
    }
}

/* =========================================================
   EXPORTS
   ========================================================= */

module.exports = {
    getLatestPurchases,
    getTopHolders,
    close
};