'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readJsonCached } = require('./readJsonCached');
const STATE_DIR =
    __dirname;
const STATE_FILE =
    path.join(
        STATE_DIR,
        'price-state.json'
    );
const SCHEMA_VERSION = 1;
const REPLACE_RETRIES =
    Math.max(
        1,
        Number(
            process.env.PRICE_STATE_REPLACE_RETRIES
        ) || 5
    );
const REPLACE_RETRY_DELAY_MS =
    Math.max(
        1,
        Number(
            process.env.PRICE_STATE_RETRY_DELAY_MS
        ) || 20
    );
function sleepSync(ms) {
    const delay =
        Math.max(
            0,
            Math.floor(
                Number(ms) || 0
            )
        );
    if (
        delay <= 0
    ) {
        return;
    }
    if (
        typeof SharedArrayBuffer !==
        'undefined' &&
        typeof Atomics !==
        'undefined'
    ) {
        const buffer =
            new SharedArrayBuffer(4);

        const view =
            new Int32Array(buffer);

        Atomics.wait(
            view,
            0,
            0,
            delay
        );
        return;
    }
    const started =
        Date.now();
    while (
        Date.now() -
        started <
        delay
    ) {
        // Intentionally busy-wait only as a last resort.
    }
}
function ensureStateDirectory() {
    fs.mkdirSync(
        STATE_DIR,
        {
            recursive: true
        }
    );
}
function validateStateData(data) {
    if (
        !data ||
        typeof data !== 'object' ||
        Array.isArray(data)
    ) {
        throw new TypeError(
            'Price state must be a non-array object.'
        );
    }
}
function buildPayload(data) {
    validateStateData(
        data
    );
    return {
        schemaVersion:
            SCHEMA_VERSION,

        ...data,

        updatedAt:
            Date.now()
    };
}
function createTempFilePath() {
    return path.join(
        STATE_DIR,
        `price-state.${process.pid}.${Date.now()}.${crypto.randomUUID()}.tmp`
    );
}
function cleanupTempFile(
    tempFile
) {
    if (!tempFile) {
        return;
    }
    try {
        fs.rmSync(
            tempFile,
            {
                force: true
            }
        );
    } catch {
        // Best-effort cleanup.
    }
}
function cleanupStaleTempFiles() {
    try {
        if (
            !fs.existsSync(
                STATE_DIR
            )
        ) {
            return;
        }
        const files =
            fs.readdirSync(
                STATE_DIR,
                {
                    withFileTypes: true
                }
            );
        const prefix =
            'price-state.';
        for (const entry of files) {
            if (
                !entry.isFile()
            ) {
                continue;
            }
            if (
                !entry.name.startsWith(
                    prefix
                )
            ) {
                continue;
            }
            if (
                !entry.name.endsWith(
                    '.tmp'
                )
            ) {
                continue;
            }
            try {
                fs.rmSync(
                    path.join(
                        STATE_DIR,
                        entry.name
                    ),
                    {
                        force: true
                    }
                );
            } catch {
                // Ignore individual cleanup failures.
            }
        }
    } catch {
        // Ignore directory cleanup failures.
    }
}
function replaceStateFile(
    tempFile
) {
    let lastError =
        null;
    for (
        let attempt = 0;
        attempt < REPLACE_RETRIES;
        attempt++
    ) {
        try {
            try {
                fs.rmSync(
                    STATE_FILE,
                    {
                        force: true
                    }
                );
            } catch (error) {
                if (
                    error?.code !==
                    'ENOENT'
                ) {
                    throw error;
                }
            }
            fs.renameSync(
                tempFile,
                STATE_FILE
            );
            return;
        } catch (error) {
            lastError =
                error;
            const retryable =
                error?.code === 'EPERM' ||
                error?.code === 'EACCES' ||
                error?.code === 'EBUSY';
            if (
                !retryable ||
                attempt >=
                REPLACE_RETRIES - 1
            ) {
                throw error;
            }
            sleepSync(
                REPLACE_RETRY_DELAY_MS *
                (attempt + 1)
            );
        }
    }
    if (lastError) {
        throw lastError;
    }
    throw new Error(
        'Failed to publish price state.'
    );
}
function setPriceState(
    data
) {
    const payload =
        buildPayload(
            data
        );
    ensureStateDirectory();
    const tempFile =
        createTempFilePath();
    let fileDescriptor =
        null;
    try {
        fileDescriptor =
            fs.openSync(
                tempFile,
                'w'
            );
        const serialized =
            JSON.stringify(
                payload
            );
        fs.writeFileSync(
            fileDescriptor,
            serialized,
            'utf8'
        );
        try {
            fs.fsyncSync(
                fileDescriptor
            );
        } finally {
            fs.closeSync(
                fileDescriptor
            );
            fileDescriptor =
                null;
        }
        replaceStateFile(
            tempFile
        );
        return payload;
    } catch (error) {
        if (
            fileDescriptor !== null
        ) {
            try {
                fs.closeSync(
                    fileDescriptor
                );
            } catch {
                // Ignore close failure.
            }
            fileDescriptor =
                null;
        }
        throw error;
    } finally {
        cleanupTempFile(
            tempFile
        );
    }
}
function getPriceState() {
    const state = readJsonCached(STATE_FILE);
    if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
    return state.schemaVersion === SCHEMA_VERSION ? state : null;
}
function getPriceStateJson() {
    const state =
        getPriceState();

    return state
        ? JSON.stringify(
            state
        )
        : null;
}

function clearPriceState() {
    try {
        fs.rmSync(
            STATE_FILE,
            {
                force: true
            }
        );
    } catch {
        // Ignore cleanup errors.
    }
    cleanupStaleTempFiles();
}
ensureStateDirectory();
cleanupStaleTempFiles();

module.exports = {
    setPriceState,
    getPriceState,
    getPriceStateJson,
    clearPriceState
};