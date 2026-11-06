'use strict';

const {
    withRpcFailover,
    rpcPostJson
} = require('./rpcEngine');

const {
    throwIfAborted
} = require('./utils');

const SYSTEM_PROGRAM_ID =
    '11111111111111111111111111111111';

const PROGRAM_OWNERS = new Set([
    'Stake11111111111111111111111111111111111111',
    'Vote111111111111111111111111111111111111111',
    'BPFLoaderUpgradeab1e11111111111111111111111',
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    'TokenzQdBNbLqP5VEhdkASh6EPFLC1PHnBqCXEpPxuEb',
    'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
    'AddressLookupTab1e1111111111111111111111111',
    'ComputeBudget111111111111111111111111111111'
]);

// Bumped whenever the classification semantics change. Old cached rows are
// intentionally ignored so a previous, narrower classification cannot survive
// a code upgrade.
const CLASSIFICATION_CACHE_VERSION = 2;

function classifyAccount(info) {
    if (!info) {
        // A token-account owner does not need to have its own on-chain account.
        // A missing AccountInfo therefore cannot be treated as proof of a program
        // or as an invalid holder. It is kept in the user-holder bucket because
        // the engine's ranking contract is address-centric, not identity-centric.
        return 'user';
    }

    if (info.executable === true) {
        return 'program';
    }

    if (!info.owner) {
        return 'unknown';
    }

    if (info.owner === SYSTEM_PROGRAM_ID) {
        return 'user';
    }

    if (PROGRAM_OWNERS.has(info.owner)) {
        return 'program';
    }

    // Solana's Account.owner says which program can modify the account; it does
    // not by itself prove that the holder address is a program address. For a
    // non-executable holder address, retain it in the address-holder bucket.
    return 'user';
}

function normalizeCacheEntry(value) {
    if (!value) {
        return null;
    }

    if (typeof value === 'string') {
        if (
            value === 'user' ||
            value === 'program' ||
            value === 'unknown'
        ) {
            return {
                state: value,
                updatedAtMs: 0,
                version: 0
            };
        }

        return null;
    }

    const state = value.state;
    const updatedAtMs = Number(
        value.updatedAtMs ??
        value.classificationUpdatedMs ??
        0
    );

    const version = Number(
        value.version ??
        value.classificationVersion ??
        0
    );

    if (
        state !== 'user' &&
        state !== 'program' &&
        state !== 'unknown'
    ) {
        return null;
    }

    return {
        state,
        updatedAtMs:
            Number.isFinite(updatedAtMs)
                ? updatedAtMs
                : 0,
        version:
            Number.isSafeInteger(version)
                ? version
                : 0
    };
}

function isCacheUsable(
    entry,
    nowMs,
    normalTtlMs,
    unknownTtlMs
) {
    if (!entry) {
        return false;
    }

    if (entry.version !== CLASSIFICATION_CACHE_VERSION) {
        return false;
    }

    if (!Number.isFinite(entry.updatedAtMs) || entry.updatedAtMs <= 0) {
        return false;
    }

    const age = Math.max(
        0,
        nowMs - entry.updatedAtMs
    );

    const ttl =
        entry.state === 'unknown'
            ? unknownTtlMs
            : normalTtlMs;

    return age <= ttl;
}

function buildBatches(
    wallets,
    batchSize
) {
    const batches = [];

    for (
        let i = 0;
        i < wallets.length;
        i += batchSize
    ) {
        batches.push(
            wallets.slice(i, i + batchSize)
        );
    }

    return batches;
}

function createLinkedAbortController(externalSignal) {
    const controller = new AbortController();

    const onAbort = () => {
        try {
            controller.abort(
                externalSignal?.reason
            );
        } catch {
            controller.abort();
        }
    };

    if (externalSignal) {
        if (externalSignal.aborted) {
            onAbort();
        } else {
            externalSignal.addEventListener(
                'abort',
                onAbort,
                { once: true }
            );
        }
    }

    return {
        controller,
        dispose() {
            externalSignal?.removeEventListener(
                'abort',
                onAbort
            );
        }
    };
}

async function classifyWallets(
    wallets,
    runtimeConfig,
    cachedStates = new Map(),
    options = {}
) {
    if (!Array.isArray(wallets) || wallets.length === 0) {
        return {
            states: new Map(),
            classificationUpdatedMs: new Map(),
            metrics: {
                total: 0,
                reused: 0,
                classified: 0,
                unknown: 0,
                failedBatches: 0,
                totalBatches: 0,
                classificationCacheVersion:
                    CLASSIFICATION_CACHE_VERSION
            }
        };
    }

    const externalSignal = options.signal || null;
    throwIfAborted(externalSignal);

    const uniqueWallets = Array.from(
        new Set(
            wallets
                .map(wallet => String(wallet || '').trim())
                .filter(Boolean)
        )
    );

    const rpcUrls =
        Array.isArray(runtimeConfig?.rpcUrls) &&
        runtimeConfig.rpcUrls.length > 0
            ? runtimeConfig.rpcUrls
            : [runtimeConfig?.rpcUrl].filter(Boolean);

    if (rpcUrls.length === 0) {
        throw new Error(
            'No RPC URLs configured for classification.'
        );
    }

    const batchSize = Math.min(
        100,
        Math.max(
            1,
            Number(
                runtimeConfig.classificationBatchSize || 100
            )
        )
    );

    const concurrency = Math.max(
        1,
        Number(
            runtimeConfig.classificationConcurrency || 6
        )
    );

    const normalTtlMs = Math.max(
        60_000,
        Number(
            runtimeConfig.classificationCacheTtlMs ||
            6 * 60 * 60 * 1000
        )
    );

    const unknownTtlMs = Math.max(
        10_000,
        Number(
            runtimeConfig.classificationUnknownTtlMs ||
            2 * 60 * 1000
        )
    );

    const nowMs = Date.now();
    const states = new Map();
    const classificationUpdatedMs = new Map();
    const pending = [];
    let reused = 0;

    for (const wallet of uniqueWallets) {
        const rawEntry =
            cachedStates instanceof Map
                ? cachedStates.get(wallet)
                : null;

        const entry = normalizeCacheEntry(
            rawEntry
        );

        if (
            entry &&
            isCacheUsable(
                entry,
                nowMs,
                normalTtlMs,
                unknownTtlMs
            )
        ) {
            states.set(
                wallet,
                entry.state
            );

            classificationUpdatedMs.set(
                wallet,
                entry.updatedAtMs
            );

            reused += 1;
            continue;
        }

        pending.push({
            wallet,
            cachedEntry: entry
        });
    }

    const batches = buildBatches(
        pending,
        batchSize
    );

    const totalBatches = batches.length;
    let nextBatchIndex = 0;
    let classified = 0;
    let failedBatches = 0;

    const onProgress =
        typeof options.onProgress === 'function'
            ? options.onProgress
            : null;

    const linked = createLinkedAbortController(
        externalSignal
    );

    const signal = linked.controller.signal;

    const worker = async workerId => {
        while (true) {
            throwIfAborted(signal);

            const currentIndex =
                nextBatchIndex++;

            if (currentIndex >= totalBatches) {
                return;
            }

            const batch = batches[currentIndex];
            const walletsInBatch =
                batch.map(item => item.wallet);

            try {
                const payload =
                    await withRpcFailover(
                        rpcUrls,
                        (rpcUrl, rpcIndex) =>
                            rpcPostJson(
                                rpcUrl,
                                'getMultipleAccounts',
                                [
                                    walletsInBatch,
                                    {
                                        encoding: 'base64',
                                        dataSlice: {
                                            offset: 0,
                                            length: 0
                                        },
                                        commitment:
                                            runtimeConfig.commitment ||
                                            'confirmed'
                                    }
                                ],
                                {
                                    label:
                                        `classification batch ${currentIndex + 1}/${totalBatches}`,
                                    attempts:
                                        runtimeConfig.classificationRequestAttempts || 2,
                                    timeoutMs:
                                        runtimeConfig.classificationRequestTimeoutMs ||
                                        30_000,
                                    requestId:
                                        `classify-${workerId}-${currentIndex}-${rpcIndex}`,
                                    signal
                                }
                            ),
                        {
                            label:
                                `classification batch ${currentIndex + 1}/${totalBatches}`,
                            startIndex:
                                workerId % rpcUrls.length,
                            cooldownMs: 1000,
                            signal
                        }
                    );

                throwIfAborted(signal);

                const accountInfos =
                    payload?.result?.value;

                if (!Array.isArray(accountInfos)) {
                    throw new Error(
                        'Invalid getMultipleAccounts response.'
                    );
                }

                if (accountInfos.length !== batch.length) {
                    throw new Error(
                        `Classification response length mismatch: expected ${batch.length}, got ${accountInfos.length}.`
                    );
                }

                const classifiedAt = Date.now();

                batch.forEach((item, i) => {
                    const state =
                        classifyAccount(accountInfos[i]);

                    states.set(
                        item.wallet,
                        state
                    );

                    classificationUpdatedMs.set(
                        item.wallet,
                        classifiedAt
                    );
                });

                classified += batch.length;

                if (onProgress) {
                    await onProgress({
                        phase: 'classification',
                        completed:
                            reused + classified,
                        total: uniqueWallets.length,
                        batchIndex:
                            currentIndex + 1,
                        totalBatches,
                        workerId,
                        state: 'ok'
                    });
                }
            } catch (error) {
                failedBatches += 1;

                console.error(
                    `[classifier] batch ${currentIndex + 1}/${totalBatches} failed:`,
                    error?.message || error
                );

                // Classification is part of the correctness boundary. A single
                // failed batch can omit or misclassify a large holder, so the
                // entire snapshot is aborted instead of publishing partial state.
                if (!signal.aborted) {
                    try {
                        linked.controller.abort(error);
                    } catch {
                        linked.controller.abort();
                    }
                }

                if (onProgress) {
                    await onProgress({
                        phase: 'classification',
                        completed:
                            reused + classified,
                        total: uniqueWallets.length,
                        batchIndex:
                            currentIndex + 1,
                        totalBatches,
                        workerId,
                        state: 'failed',
                        error:
                            error?.message ||
                            String(error)
                    });
                }

                throw error;
            }
        }
    };

    const workerCount = Math.min(
        concurrency,
        Math.max(1, totalBatches)
    );

    try {
        await Promise.all(
            Array.from(
                { length: workerCount },
                (_, workerId) => worker(workerId)
            )
        );
    } finally {
        linked.dispose();
    }

    let unknown = 0;

    for (const wallet of uniqueWallets) {
        if (states.get(wallet) === 'unknown') {
            unknown += 1;
        }
    }

    return {
        states,
        classificationUpdatedMs,
        metrics: {
            total: uniqueWallets.length,
            reused,
            classified,
            unknown,
            failedBatches,
            totalBatches,
            classificationCacheVersion:
                CLASSIFICATION_CACHE_VERSION
        }
    };
}

module.exports = {
    classifyWallets,
    classifyAccount,
    CLASSIFICATION_CACHE_VERSION
};
