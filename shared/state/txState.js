'use strict';

const fs = require('fs');
const path = require('path');

const STATE_DIR = __dirname;

const STATE_FILE = path.join(
    STATE_DIR,
    'tx-state.json'
);

const TEMP_FILE = path.join(
    STATE_DIR,
    'tx-state.tmp'
);

const SCHEMA_VERSION = 1;

let txStateCache = null;

function ensureStateDirectory() {
    fs.mkdirSync(
        STATE_DIR,
        { recursive: true }
    );
}

function setTxState(data) {
    if (!data || typeof data !== 'object') {
        throw new TypeError(
            'Transaction state must be an object.'
        );
    }

    ensureStateDirectory();

    const payload = JSON.stringify({
        schemaVersion: SCHEMA_VERSION,
        ...data,
        updatedAt: Date.now()
    });

    fs.writeFileSync(
        TEMP_FILE,
        payload,
        'utf8'
    );

    fs.renameSync(
        TEMP_FILE,
        STATE_FILE
    );
    txStateCache = null;
}

function getTxState() {
    try {
        const stat = fs.statSync(STATE_FILE);
        if (txStateCache && txStateCache.mtimeMs === stat.mtimeMs && txStateCache.size === stat.size) {
            return txStateCache.data;
        }
        const raw = fs.readFileSync(STATE_FILE, 'utf8');

        if (!raw.trim()) {
            return null;
        }

        const state = JSON.parse(raw);

        if (
            !state ||
            typeof state !== 'object'
        ) {
            return null;
        }

        txStateCache = { mtimeMs: stat.mtimeMs, size: stat.size, data: state };
        return state;

    } catch (error) {
        txStateCache = null;
        return null;
    }
}

function getTxStateJson() {
    const state = getTxState();

    return state
        ? JSON.stringify(state)
        : null;
}

function clearTxState() {
    txStateCache = null;
    try {
        if (fs.existsSync(STATE_FILE)) {
            fs.unlinkSync(STATE_FILE);
        }
    } catch (error) {
        // Ignore cleanup errors.
    }

    try {
        if (fs.existsSync(TEMP_FILE)) {
            fs.unlinkSync(TEMP_FILE);
        }
    } catch (error) {
        // Ignore cleanup errors.
    }
}

module.exports = {
    setTxState,
    getTxState,
    getTxStateJson,
    clearTxState
};