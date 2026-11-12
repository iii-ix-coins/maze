'use strict';

const fs = require('fs');
const path = require('path');

const STATE_DIR = __dirname;

const STATE_FILE = path.join(
    STATE_DIR,
    'holder-state.json'
);

const TEMP_FILE = path.join(
    STATE_DIR,
    'holder-state.tmp'
);

const SCHEMA_VERSION = 1;

let holderStateCache = null;

function ensureStateDirectory() {
    fs.mkdirSync(
        STATE_DIR,
        { recursive: true }
    );
}

function setHolderState(data) {
    if (!data || typeof data !== 'object') {
        throw new TypeError(
            'Holder state must be an object.'
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
    holderStateCache = null;
}

function getHolderState() {
    try {
        const stat = fs.statSync(STATE_FILE);
        if (holderStateCache && holderStateCache.mtimeMs === stat.mtimeMs && holderStateCache.size === stat.size) {
            return holderStateCache.data;
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

        holderStateCache = { mtimeMs: stat.mtimeMs, size: stat.size, data: state };
        return state;
    } catch (error) {
        holderStateCache = null;
        return null;
    }
}

function getHolderStateJson() {
    const state = getHolderState();

    return state
        ? JSON.stringify(state)
        : null;
}

function clearHolderState() {
    holderStateCache = null;
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
    setHolderState,
    getHolderState,
    getHolderStateJson,
    clearHolderState
};