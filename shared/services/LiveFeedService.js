'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { readJsonCached } = require('../state/readJsonCached');

/* =========================================================
   HOLDER DATABASE
   ========================================================= */

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

const DEFAULT_HOLDER_LIMIT = 100;
const MAX_LIMIT = 100;
const HOLDER_FEED_CACHE_MS = 3000;
const holderFeedCache = new Map();

let holderDb = null;

function getHolderDb() {
    if (!holderDb) {
        holderDb = new Database(HOLDER_DB_PATH, {
            readonly: true,
            fileMustExist: true
        });
        holderDb.pragma('busy_timeout = 5000');
    }
    return holderDb;
}

function clampLimit(value, fallback) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) return fallback;
    if (parsed < 1) return 1;
    return Math.min(parsed, MAX_LIMIT);
}

function readHolderState() {
    const state = readJsonCached(HOLDER_STATE_PATH);
    return state && typeof state === 'object' && !Array.isArray(state)
        ? state
        : null;
}

/** Read the current Top-100 holder snapshot. */
function getTopHolders(options = {}) {
    const limit = clampLimit(options.limit, DEFAULT_HOLDER_LIMIT);
    const cached = holderFeedCache.get(limit);
    if (cached && Date.now() - cached.createdAt < HOLDER_FEED_CACHE_MS) {
        return cached.data;
    }

    const rows = getHolderDb().prepare(`
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
    `).all(limit);

    const state = readHolderState();
    const snapshotTimestamp = rows.length > 0
        ? rows[0].snapshotTimestamp
        : (state?.data?.timestamp || null);

    const payload = {
        type: 'top-holders',
        generatedAt: snapshotTimestamp,
        snapshotTimestamp,
        totalHolders: state?.data?.totalHolders ?? null,
        totalSupply: state?.data?.totalSupply ?? null,
        count: rows.length,
        items: rows.map(row => ({
            rank: row.rank,
            wallet: row.wallet,
            rawAmount: row.rawAmount,
            uiAmount: row.uiAmount,
            state: row.state,
            lastUpdatedMs: row.lastUpdatedMs,
            lastSellAllTime: row.lastSellAllTime,
            snapshotTimestamp: row.snapshotTimestamp
        }))
    };

    holderFeedCache.set(limit, { createdAt: Date.now(), data: payload });
    return payload;
}

function close() {
    if (!holderDb) return;
    try {
        holderDb.close();
    } catch {
        // Ignore close errors during process shutdown.
    }
    holderDb = null;
}

module.exports = {
    getTopHolders,
    close
};
