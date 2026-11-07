'use strict';

const path = require('path');

const { config, validateConfig } = require('./config');
const HolderDatabase = require('./lib/db');
const SnapshotService = require('./lib/snapshotService');
const ClassificationService = require('./lib/classificationService');
const RankingService = require('./lib/rankingService');
const { setHolderState, getHolderState } = require('../../shared/state/holderState');
const { sleep } = require('./lib/utils');

const DB_PATH = path.join(__dirname, 'data', 'holders.db');
const FAST_RETRY_MS = 10_000;

let db = null;
let shuttingDown = false;
let shutdownPromise = null;
let rootAbortController = null;
let activeCyclePromise = null;
let wakeSnapshotSleep = null;
let snapshotService = null;
let classificationService = null;
let rankingService = null;
let snapshotInProgress = false;

function createAbortError(message = 'Holder Engine shutdown requested.') {
    const error = new Error(message);
    error.name = 'AbortError';
    error.code = 'ABORT_ERR';
    return error;
}

function isAbortError(error) {
    return Boolean(
        error && (
            error.name === 'AbortError' ||
            error.code === 'ABORT_ERR'
        )
    );
}

function sleepOrShutdown(ms) {
    if (shuttingDown || rootAbortController?.signal.aborted) {
        return Promise.resolve(true);
    }

    const delay = Math.max(Number(ms) || 0, 0);

    return new Promise(resolve => {
        let settled = false;
        let timer = null;

        const finish = interrupted => {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            if (wakeSnapshotSleep === interrupt) {
                wakeSnapshotSleep = null;
            }
            resolve(interrupted);
        };

        const interrupt = () => finish(true);
        timer = setTimeout(() => finish(false), delay);
        wakeSnapshotSleep = interrupt;
    });
}

function safeSetHolderState(nextState, context) {
    try {
        setHolderState(nextState);
        return true;
    } catch (error) {
        console.error(
            `[Holder Engine] State publication failed during ${context}:`,
            error?.message || error
        );
        return false;
    }
}

function buildCurrentStateData() {
    if (!db) return null;

    const meta = db.getLatestSnapshotMeta();
    if (!meta) return null;

    return {
        timestamp: meta.generatedAt,
        totalHolders: meta.holderCount,
        totalSupply: meta.mintSupplyRaw,
        observedHolderBalance: meta.observedHolderBalanceRaw,
        topHolders: db.getTop100UserHolders(),
        classification: db.getClassificationSummary(),
        ranking: db.getRankingSummary()
    };
}

function publishRuntimeState(status, error = null) {
    const data = buildCurrentStateData();
    const ranking = data?.ranking || null;
    const classification = data?.classification || null;
    const current = getHolderState() || {};

    // Background Classification/Ranking must not change the externally visible
    // Snapshot phase while a new snapshot scan is still running.
    const effectiveStatus =
        snapshotInProgress && status === 'ready'
            ? 'scanning'
            : status;

    safeSetHolderState(
        {
            ...current,
            status: effectiveStatus,
            data,
            classification,
            ranking,
            lastError: error
                ? String(error?.message || error)
                : null
        },
        `runtime-${effectiveStatus}`
    );
}

async function shutdown(signal = 'SIGINT') {
    const requestedExitCode = signal === 'FATAL' ? 1 : 0;
    if (shutdownPromise) return shutdownPromise;

    shuttingDown = true;

    if (wakeSnapshotSleep) wakeSnapshotSleep();

    if (rootAbortController) {
        try {
            rootAbortController.abort(
                createAbortError(
                    `Holder Engine shutdown requested by ${signal}.`
                )
            );
        } catch {
            // Ignore repeated abort.
        }
    }

    shutdownPromise = (async () => {
        console.log(`[Holder Engine] Received ${signal}. Shutting down...`);

        if (activeCyclePromise) {
            try {
                await activeCyclePromise;
            } catch {
                // Snapshot cycle errors are already handled by the loop.
            }
        }

        try {
            await Promise.all([
                classificationService?.stop(),
                rankingService?.stop()
            ]);
        } catch (error) {
            console.error(
                '[Holder Engine] Background service shutdown failed:',
                error?.message || error
            );
        }

        try {
            if (db) {
                db.close();
                db = null;
            }
        } catch (error) {
            console.error(
                '[Holder Engine] Database close failed:',
                error?.message || error
            );
        }

        // Preserve a fatal startup/runtime exit code; a graceful shutdown must
        // not accidentally turn a failed process into a successful exit.
        if (requestedExitCode !== 0 || process.exitCode == null) {
            process.exitCode = requestedExitCode;
        }
    })();

    return shutdownPromise;
}

process.once('SIGINT', () => { void shutdown('SIGINT'); });
process.once('SIGTERM', () => { void shutdown('SIGTERM'); });

async function startEngine() {
    validateConfig();
    db = new HolderDatabase(DB_PATH);
    rootAbortController = new AbortController();
    const { signal } = rootAbortController;

    classificationService = new ClassificationService({
        runtimeConfig: config,
        db,
        signal,
        onProgress: async progress => {
            if (progress?.state === 'completed') {
                const metrics = db.getClassificationSummary();
                console.log(
                    `[Holder Engine] [Classification] ` +
                    `updated=${progress.updatedCount || 0} ` +
                    `queue=${metrics.queue} ` +
                    `unknown=${metrics.unknownHolders}`
                );
            }
        },
        onUpdated: async () => {
            rankingService?.requestRebuild('classification-update');
            publishRuntimeState('ready');
        }
    });

    rankingService = new RankingService({
        runtimeConfig: config,
        db,
        signal,
        onRebuilt: async metrics => {
            const data = buildCurrentStateData();
            const current = getHolderState() || {};
            safeSetHolderState({
                ...current,
                // Ranking may finish while a new snapshot is being scanned.
                // Never let a background projection overwrite that phase.
                status: snapshotInProgress ? 'scanning' : 'ready',
                data,
                classification: data?.classification || null,
                ranking: {
                    ...metrics,
                    ...(data?.ranking || {})
                },
                lastError: null
            }, 'ranking-update');
        }
    });

    snapshotService = new SnapshotService({
        runtimeConfig: config,
        db,
        signal,
        onProgress: progress => {
            if (signal.aborted) throw signal.reason || createAbortError();
            if (progress?.phase === 'scan') {
                console.log(
                    `[Holder Engine] [Snapshot] ` +
                    `pages=${progress.pages} ` +
                    `accounts=${progress.tokenAccounts} ` +
                    `holders=${progress.holders} ` +
                    `strategy=${progress.strategy}`
                );
            }
        },
        onCommitted: async result => {
            snapshotInProgress = false;

            console.log(
                `[Holder Engine] [Snapshot] Committed independently in ` +
                `${result.durationMs}ms. ` +
                `holders=${result.holderCount} ` +
                `pages=${result.pages}`
            );

            classificationService?.wake('new-snapshot');
            rankingService?.requestRebuild('new-snapshot');

            const data = buildCurrentStateData();
            const current = getHolderState() || {};

            safeSetHolderState({
                ...current,
                status: 'ready',
                data,
                classification: data?.classification || null,
                ranking: data?.ranking || null,
                lastError: null,
                lastScan: {
                    startedAt: new Date(result.startedAtMs).toISOString(),
                    completedAt: new Date().toISOString(),
                    durationMs: result.durationMs,
                    success: true,
                    error: null,
                    scan: {
                        strategy: result.strategy,
                        pages: result.pages,
                        discoveredTokenAccounts: result.tokenAccounts,
                        processedTokenAccounts: result.processedTokenAccounts
                    }
                }
            }, 'snapshot-committed');
        }
    });

    console.log(
        `[Holder Engine] Snapshot / Classification / Ranking services started. ` +
        `Normal snapshot every ${config.intervalSeconds}s.`
    );

    // Start both background services without waiting for them to finish.
    void classificationService.start().catch(error => {
        if (!isAbortError(error)) {
            console.error('[Holder Engine] [Classification] Service terminated:', error?.message || error);
        }
    });
    void rankingService.start().catch(error => {
        if (!isAbortError(error)) {
            console.error('[Holder Engine] [Ranking] Service terminated:', error?.message || error);
        }
    });


    try {
        while (!signal.aborted && !shuttingDown) {
            const startedAt = Date.now();
            activeCyclePromise = (async () => {
                const previousState = getHolderState();

                safeSetHolderState({
                    status: 'scanning',
                    data: previousState?.data || buildCurrentStateData(),
                    classification: previousState?.classification || null,
                    ranking: previousState?.ranking || null,
                    lastError: null,
                    lastScan: {
                        startedAt: new Date(startedAt).toISOString(),
                        completedAt: null,
                        durationMs: 0,
                        success: null,
                        error: null
                    }
                }, 'scan-start');

                snapshotInProgress = true;
                try {
                    await snapshotService.runOnce();
                } catch (error) {
                    snapshotInProgress = false;
                    if (isAbortError(error)) throw error;

                    // Complete the scan lifecycle on failure as well. Without
                    // this, consumers can see a permanently 'scanning' lastScan.
                    const current = getHolderState() || {};
                    safeSetHolderState({
                        ...current,
                        status: 'ready',
                        data: current.data || buildCurrentStateData(),
                        classification: current.classification || db.getClassificationSummary(),
                        ranking: current.ranking || db.getRankingSummary(),
                        lastError: String(error?.message || error),
                        lastScan: {
                            ...(current.lastScan || {}),
                            startedAt: current.lastScan?.startedAt || new Date(startedAt).toISOString(),
                            completedAt: new Date().toISOString(),
                            durationMs: Date.now() - startedAt,
                            success: false,
                            error: String(error?.message || error)
                        }
                    }, 'snapshot-failed');
                    throw error;
                }
            })();

            let cycleError = null;
            try {
                await activeCyclePromise;
            } catch (error) {
                cycleError = error;
            } finally {
                activeCyclePromise = null;
            }

            if (!cycleError) {
                const elapsed = Date.now() - startedAt;
                const waitTime = Math.max(
                    config.intervalSeconds * 1000 - elapsed,
                    0
                );
                await sleepOrShutdown(waitTime);
                continue;
            }

            if (isAbortError(cycleError) || signal.aborted) break;

            console.warn(
                '[Holder Engine] [Snapshot] Cycle failed. Background Classification/Ranking remain active:',
                cycleError?.message || cycleError
            );

            if (cycleError?.stack) console.warn(cycleError.stack);
            if (shuttingDown) break;

            await sleepOrShutdown(FAST_RETRY_MS);
        }
    } finally {
        snapshotInProgress = false;
    }

    if (!shuttingDown) {
        await shutdown('ENGINE_EXIT');
    }
}

module.exports = { startEngine };

if (require.main === module) {
    startEngine().catch(error => {
        console.error('[Holder Engine Fatal Error]', error);
        void shutdown('FATAL');
        process.exitCode = 1;
    });
}
