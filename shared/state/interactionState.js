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
        'interaction-state.json'
    );
const SCHEMA_VERSION = 1;
const DEFAULT_PUBLISH_DELAY_MS = 100;
const PUBLISH_DELAY_MS = (() => {
    const value =
        Number(
            process.env.INTERACTION_STATE_PUBLISH_DELAY_MS
        );
    if (
        Number.isFinite(value) &&
        value >= 10 &&
        value <= 5000
    ) {
        return Math.floor(value);
    }
    return DEFAULT_PUBLISH_DELAY_MS;
})();
const RETRY_DELAYS_MS = Object.freeze([
    25,
    50,
    100,
    200
]);
let pendingState = null;
let publishTimer = null;
let flushPromise = null;
let flushAgain = false;
let lastPublishedState = null;
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
            'Interaction state must be an object.'
        );
    }
}
function buildPayload(data) {
    validateStateData(data);
    return {
        schemaVersion:
            SCHEMA_VERSION,
        ...data,
        updatedAt:
            Date.now()
    };
}
function getTemporaryFilePath() {
    return path.join(
        STATE_DIR,
        `interaction-state.${process.pid}.${Date.now()}.${crypto.randomUUID()}.tmp`
    );
}
function isRetryableFilesystemError(error) {
    const code =
        error?.code;
    return (
        code === 'EPERM' ||
        code === 'EACCES' ||
        code === 'EBUSY'
    );
}
function sleep(ms) {
    return new Promise(
        resolve =>
            setTimeout(
                resolve,
                ms
            )
    );
}
async function replaceStateFile(tempFile) {
    // On POSIX, rename replaces the destination atomically.
    try {
        await fs.promises.rename(tempFile, STATE_FILE);
        return;
    } catch (error) {
        // Windows may reject replacing an existing destination.
        if (error?.code === 'ENOENT' || !isRetryableFilesystemError(error)) {
            throw error;
        }
    }

    const backupFile = path.join(
        STATE_DIR,
        `interaction-state.${process.pid}.${Date.now()}.${crypto.randomUUID()}.bak`
    );
    let movedOldState = false;
    let published = false;

    try {
        try {
            await fs.promises.rename(STATE_FILE, backupFile);
            movedOldState = true;
        } catch (error) {
            if (error?.code !== 'ENOENT') throw error;
        }

        await fs.promises.rename(tempFile, STATE_FILE);
        published = true;
    } catch (error) {
        // Restore the last good state if publishing the replacement fails.
        if (movedOldState) {
            try {
                await fs.promises.rename(backupFile, STATE_FILE);
                movedOldState = false;
            } catch (restoreError) {
                // Preserve the backup for manual recovery if restoration fails.
                error.restoreError = restoreError;
            }
        }
        throw error;
    } finally {
        // Do not delete a backup that may be the only remaining good copy.
        if (published || !movedOldState) {
            try {
                await fs.promises.rm(backupFile, { force: true });
            } catch {
                // Best-effort cleanup; do not mask the primary result.
            }
        }
    }
}

async function writeState(
    state
) {
    ensureStateDirectory();
    const tempFile =
        getTemporaryFilePath();
    try {
        const payload =
            JSON.stringify(
                state
            );
        await fs.promises.writeFile(
            tempFile,
            payload,
            {
                encoding: 'utf8',
                flag: 'w'
            }
        );
        try {
            const handle =
                await fs.promises.open(
                    tempFile,
                    'r'
                );
            try {
                await handle.sync();
            } finally {
                await handle.close();
            }
        } catch {
        }
        await replaceStateFile(
            tempFile
        );
        lastPublishedState =
            state;
    } finally {
        try {
            await fs.promises.rm(
                tempFile,
                {
                    force: true
                }
            );
        } catch {
        }
    }
}
async function flushInternal() {
    if (
        flushPromise
    ) {
        flushAgain = true;
        return flushPromise;
    }
    flushPromise =
        (async () => {
            try {
                do {
                    flushAgain = false;
                    const state =
                        pendingState;
                    pendingState =
                        null;
                    if (!state) {
                        break;
                    }
                    await writeState(
                        state
                    );
                } while (
                    flushAgain ||
                    pendingState
                );
            } finally {
                flushPromise =
                    null;
                if (
                    pendingState &&
                    !publishTimer
                ) {
                    schedulePublish();
                }
            }
        })();
    return flushPromise;
}
function schedulePublish() {
    if (
        publishTimer ||
        flushPromise
    ) {
        return;
    }
    publishTimer =
        setTimeout(
            () => {
                publishTimer =
                    null;
                void flushInternal()
                    .catch(
                        error => {
                            console.error(
                                '[Interaction State] Publish failed:',
                                error?.message ||
                                error
                            );
                            if (
                                lastPublishedState !==
                                pendingState
                            ) {
                                schedulePublish();
                            }
                        }
                    );
            },
            PUBLISH_DELAY_MS
        );
    if (
        typeof publishTimer.unref ===
        'function'
    ) {
        publishTimer.unref();
    }
}
function setInteractionState(
    data
) {
    const payload =
        buildPayload(
            data
        );
    pendingState =
        payload;
    schedulePublish();
    return payload;
}
function getInteractionState() {
    const state = readJsonCached(STATE_FILE);
    return state && typeof state === 'object' && !Array.isArray(state) ? state : null;
}
function getInteractionStateJson() {
    const state =
        getInteractionState();
    return state
        ? JSON.stringify(
            state
        )
        : null;
}
async function flushInteractionState() {
    if (
        publishTimer
    ) {
        clearTimeout(
            publishTimer
        );
        publishTimer =
            null;
    }
    await flushInternal();
}
async function clearInteractionState() {
    if (
        publishTimer
    ) {
        clearTimeout(
            publishTimer
        );
        publishTimer =
            null;
    }
    pendingState =
        null;
    flushAgain =
        false;
    try {
        await fs.promises.rm(
            STATE_FILE,
            {
                force: true
            }
        );
    } catch {
    }
    lastPublishedState =
        null;
}
module.exports = {
    setInteractionState,
    getInteractionState,
    getInteractionStateJson,
    flushInteractionState,
    clearInteractionState
};