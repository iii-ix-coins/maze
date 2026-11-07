'use strict';

const path =
    require('path');

const {
    config,
    validateConfig
} = require('./config');

const {
    sleep
} = require('./lib/utils');

const TxDatabase =
    require('./lib/db');

const TxRunner =
    require('./lib/TxRunner');

const TransactionWriter =
    require('./lib/TxEngine/storage/transactionWriter');

const TransactionDeduplicator =
    require('./lib/ingestion/TransactionDeduplicator');

const TransactionIngestionService =
    require('./lib/ingestion/TransactionIngestionService');

const {
    WebSocketManager
} = require('./lib/websocket/WebSocketManager');

const {
    setTxState
} = require('../../shared/state/txState');

/*
 * =========================================================
 * Paths
 * =========================================================
 */

const DB_PATH =
    path.join(
        __dirname,
        'data',
        'transactions.db'
    );

/*
 * =========================================================
 * Runtime lifecycle
 * =========================================================
 */

let runtime = null;

/*
 * =========================================================
 * State publishing
 * =========================================================
 */

function publishState({
    db,
    status,
    mintAddress,
    startedAt = null,
    transactions = 0,
    error = null,
    websocket = null
}) {

    if (
        !db ||
        typeof db.getState !== 'function' ||
        typeof db.getLatestBuyers !== 'function'
    ) {
        throw new TypeError(
            'A valid transaction database is required.'
        );
    }

    const txState =
        db.getState();

    const latestBuyers =
        db.getLatestBuyers(50);

    setTxState({
        status,

        mintAddress,

        latestBuyers,

        state:
            txState,

        lastScan: {
            completedAt:
                new Date().toISOString(),

            durationMs:
                startedAt !== null
                    ? Date.now() - startedAt
                    : 0,

            transactions,

            success:
                !error,

            error:
                error
                    ? String(error)
                    : null
        },

        websocket
    });

    return {
        txState,
        latestBuyers
    };
}

/*
 * =========================================================
 * Track a realtime ingestion promise
 * =========================================================
 *
 * EventEmitter does not await async listeners.
 *
 * Therefore every ingestion promise is explicitly tracked.
 *
 * This is essential for race-safe shutdown:
 *
 * WebSocket stop
 *      ↓
 * no new events
 *      ↓
 * await all existing ingestion promises
 *      ↓
 * flush writer
 *      ↓
 * close writer
 *      ↓
 * close DB
 */

function trackRealtimeIngestion(
    state,
    notification
) {

    if (
        !state ||
        state.shutdownRequested
    ) {
        return;
    }

    const promise =
        Promise.resolve()
            .then(
                () =>
                    state.ingestion.ingest(
                        notification?.raw,
                        {
                            source:
                                'helius-websocket'
                        }
                    )
            )
            .catch(
                error => {

                    console.error(
                        '[Tx Engine] WebSocket ingestion failed:',
                        error?.message ||
                        error
                    );

                    return null;
                }
            );

    state.pendingIngestions.add(
        promise
    );

    promise.finally(
        () => {
            state.pendingIngestions.delete(
                promise
            );
        }
    );
}

/*
 * =========================================================
 * Wait for realtime ingestion drain
 * =========================================================
 */

async function waitForRealtimeDrain(
    state
) {

    while (
        state.pendingIngestions.size > 0
    ) {

        const pending =
            Array.from(
                state.pendingIngestions
            );

        if (
            pending.length === 0
        ) {
            break;
        }

        await Promise.allSettled(
            pending
        );
    }
}

/*
 * =========================================================
 * Graceful shutdown
 * =========================================================
 */

async function shutdownEngine() {

    if (
        !runtime
    ) {
        return;
    }

    if (
        runtime.shutdownPromise
    ) {
        return runtime.shutdownPromise;
    }

    runtime.shutdownRequested =
        true;

    runtime.shutdownPromise =
        (async () => {

            console.log(
                '[Tx Engine] Graceful shutdown started...'
            );

            /*
             * -----------------------------------------
             * 1. Stop WebSocket source
             * -----------------------------------------
             *
             * This prevents new realtime transactions
             * from entering the ingestion layer.
             */

            if (
                runtime.manager
            ) {

                try {

                    await runtime.manager.stop();

                    console.log(
                        '[Tx Engine] WebSocket manager stopped.'
                    );

                } catch (error) {

                    console.error(
                        '[Tx Engine] WebSocket stop failed:',
                        error?.message ||
                        error
                    );
                }
            }

            /*
             * -----------------------------------------
             * 2. Drain realtime ingestion
             * -----------------------------------------
             *
             * Important:
             * manager.stop() only prevents future events.
             *
             * Ingestion handlers already started may still
             * be awaiting writer.append().
             *
             * Wait for all of them before closing the writer.
             */

            if (
                runtime.ingestion
            ) {

                try {

                    await waitForRealtimeDrain(
                        runtime
                    );

                    console.log(
                        '[Tx Engine] Realtime ingestion queue drained.'
                    );

                } catch (error) {

                    console.error(
                        '[Tx Engine] Realtime ingestion drain failed:',
                        error?.message ||
                        error
                    );
                }
            }

            /*
             * -----------------------------------------
             * 3. Wait for historical batch scan
             * -----------------------------------------
             *
             * This is the critical DB race protection.
             *
             * TxRunner owns its historical writer.
             *
             * We MUST NOT close SQLite while TxRunner may
             * still be inside TxPipeline.
             */

            if (
                runtime.currentScanPromise
            ) {

                try {

                    await runtime.currentScanPromise;

                    console.log(
                        '[Tx Engine] Historical batch scan finished.'
                    );

                } catch (error) {

                    console.error(
                        '[Tx Engine] Historical scan finished with error during shutdown:',
                        error?.message ||
                        error
                    );
                }

            }

            /*
             * -----------------------------------------
             * 4. Flush realtime ingestion
             * -----------------------------------------
             */

            if (
                runtime.ingestion
            ) {

                try {

                    await runtime.ingestion.flush();

                    console.log(
                        '[Tx Engine] Realtime ingestion flushed.'
                    );

                } catch (error) {

                    console.error(
                        '[Tx Engine] Realtime ingestion flush failed:',
                        error?.message ||
                        error
                    );
                }
            }

            /*
             * -----------------------------------------
             * 5. Close realtime writer
             * -----------------------------------------
             */

            if (
                runtime.websocketWriter
            ) {

                try {

                    await runtime.websocketWriter.close();

                    console.log(
                        '[Tx Engine] Realtime writer closed.'
                    );

                } catch (error) {

                    console.error(
                        '[Tx Engine] Realtime writer close failed:',
                        error?.message ||
                        error
                    );
                }
            }

            /*
             * -----------------------------------------
             * 6. Close shared database LAST
             * -----------------------------------------
             */

            if (
                runtime.db
            ) {

                try {

                    runtime.db.close();

                    console.log(
                        '[Tx Engine] Database closed.'
                    );

                } catch (error) {

                    console.error(
                        '[Tx Engine] Database close failed:',
                        error?.message ||
                        error
                    );
                }
            }

            console.log(
                '[Tx Engine] Graceful shutdown completed.'
            );

        })();

    try {

        await runtime.shutdownPromise;

    } finally {

        /*
         * Do NOT null runtime here.
         *
         * startEngine() owns final runtime cleanup.
         */
    }
}

/*
 * =========================================================
 * Main engine
 * =========================================================
 */

async function startEngine() {

    validateConfig();

    if (
        runtime
    ) {
        throw new Error(
            'Transaction Engine is already running.'
        );
    }

    const state = {

        shutdownRequested:
            false,

        shutdownPromise:
            null,

        db:
            null,

        txRunner:
            null,

        websocketWriter:
            null,

        deduplicator:
            null,

        ingestion:
            null,

        manager:
            null,

        /*
         * Current historical scan promise.
         *
         * This is explicitly tracked so shutdown can
         * await it before closing SQLite.
         */
        currentScanPromise:
            null,

        /*
         * All async WebSocket ingestion operations
         * currently in flight.
         */
        pendingIngestions:
            new Set()
    };

    runtime =
        state;

    try {

        /*
         * =================================================
         * Shared SQLite
         * =================================================
         */

        state.db =
            new TxDatabase(
                DB_PATH
            );

        /*
         * =================================================
         * Existing historical engine
         * =================================================
         */

        state.txRunner =
            new TxRunner(
                state.db,
                {
                    concurrency: config.txConcurrency,
                    timeout: config.txRequestTimeoutMs,
                    batchSize: config.batchSize,
                    batchConcurrency: config.txConcurrency,
                    retries: config.txRetryLimit,
                    retryDelay: config.txRetryBaseDelayMs,
                    mode: config.txFetchMode,
                    commitment: config.commitment,
                    cacheMaxEntries: config.txCacheMaxEntries
                }
            );

        /*
         * =================================================
         * Optional realtime subsystem resources
         * =================================================
         * When TX_WS_ENABLED=false, do not even create the
         * realtime writer/deduplicator/ingestion objects.
         * The HTTP historical scanner remains independent.
         */

        if (config.wsEnabled) {
            state.websocketWriter = new TransactionWriter(
                state.db,
                config.mintAddress,
                {
                    bufferSize: 100,
                    source: 'helius-websocket'
                }
            );
            await state.websocketWriter.open();

            state.deduplicator = new TransactionDeduplicator({
                ttlMs: config.wsDedupTtlMs,
                maxEntries: config.wsDedupMaxEntries
            });

            state.ingestion = new TransactionIngestionService({
                writer: state.websocketWriter,
                deduplicator: state.deduplicator,
                maxBatchSize: config.wsIngestionBatchSize
            });
        }

        /*
         * =================================================
         * WebSocket subsystem
         * =================================================
         */

        if (
            config.wsEnabled
        ) {

            state.manager =
                new WebSocketManager({

                    apiKeys:
                        config.heliusApiKeys,

                    mintAddress:
                        config.mintAddress,

                    wsUrl:
                        config.wsUrl,

                    commitment:
                        config.wsCommitment,

                    subscriptionId:
                        config.wsSubscriptionId,

                    connectTimeoutMs:
                        config.wsConnectTimeoutMs,

                    heartbeatIntervalMs:
                        config.wsHeartbeatIntervalMs,

                    inactivityTimeoutMs:
                        config.wsInactivityTimeoutMs,

                    closeTimeoutMs:
                        config.wsCloseTimeoutMs,

                    maxMessageBytes:
                        config.wsMaxMessageBytes,

                    maxSupportedTransactionVersion:
                        config.wsMaxSupportedTransactionVersion,

                    accessDeniedCooldownMs:
                        config.ws403CooldownMs,

                    reconnectBaseDelayMs:
                        config.wsReconnectBaseDelayMs,

                    reconnectMaxDelayMs:
                        config.wsReconnectMaxDelayMs,

                    reconnectJitterMs:
                        config.wsReconnectJitterMs,

                    maxReconnectAttempts:
                        config.wsMaxReconnectAttempts,

                    startDelayMs:
                        config.wsStartDelayMs
                });

            /*
             * ---------------------------------------------
             * Transaction event
             * ---------------------------------------------
             */

            state.manager.on(
                'transaction',
                notification => {

                    trackRealtimeIngestion(
                        state,
                        notification
                    );
                }
            );

            /*
             * ---------------------------------------------
             * Connection events
             * ---------------------------------------------
             */

            state.manager.on(
                'connected',
                info => {

                    console.log(
                        `[Tx Engine] WebSocket connected. API key index: ${info.apiKeyIndex}`
                    );
                }
            );

            state.manager.on(
                'subscribed',
                info => {

                    console.log(
                        `[Tx Engine] WebSocket subscription active. Remote subscription ID: ${info.subscriptionId}`
                    );
                }
            );

            state.manager.on(
                'reconnecting',
                info => {

                    console.warn(
                        `[Tx Engine] WebSocket reconnecting. Attempt ${info.attempt}, delay ${info.delayMs}ms`
                    );
                }
            );

            state.manager.on(
                'reconnectFailed',
                info => {

                    console.warn(
                        `[Tx Engine] WebSocket reconnect attempt ${info.attempt} failed:`,
                        info.error?.message ||
                        info.error
                    );
                }
            );

            state.manager.on(
                'reconnectExhausted',
                info => {

                    console.error(
                        '[Tx Engine] WebSocket reconnect attempts exhausted:',
                        info?.reason?.message ||
                        info?.reason ||
                        info
                    );
                }
            );

            state.manager.on(
                'accessDenied',
                info => {
                    console.warn(
                        '[Tx Engine] WebSocket access denied. ' +
                        `Realtime stream disabled for ${Math.ceil((info?.cooldownMs || 0) / 60000)} minutes; historical scanner continues.`
                    );
                }
            );

            state.manager.on(
                'streamError',
                error => {
                    if (error?.statusCode === 403 || error?.code === 'WS_HTTP_403') {
                        return;
                    }

                    console.error(
                        '[Tx Engine] WebSocket stream error:',
                        error?.message ||
                        error
                    );
                }
            );

            state.manager.on(
                'subscriptionError',
                info => {

                    console.error(
                        '[Tx Engine] WebSocket subscription error:',
                        info?.error?.message ||
                        info?.error ||
                        info
                    );
                }
            );

            state.manager.on(
                'streamClose',
                info => {

                    if (
                        info?.manual === true
                    ) {
                        return;
                    }

                    console.warn(
                        `[Tx Engine] WebSocket stream closed. code=${info?.code ?? 'unknown'} reason=${info?.reason || 'none'}`
                    );
                }
            );

            /*
             * ---------------------------------------------
             * Start realtime subsystem
             * ---------------------------------------------
             *
             * IMPORTANT:
             *
             * WebSocket failure NEVER aborts the historical
             * transaction engine.
             *
             * WebSocketManager internally schedules the
             * background reconnect.
             */

            try {

                await state.manager.start();

            } catch (error) {

                console.warn(
                    '[Tx Engine] Initial WebSocket connection failed; background reconnect remains active:',
                    error?.message ||
                    error
                );
            }

        } else {

            console.log(
                '[Tx Engine] WebSocket realtime subsystem is disabled.'
            );
        }

        /*
         * =================================================
         * Initial state publication
         * =================================================
         */

        publishState({

            db:
                state.db,

            status:
                'starting',

            mintAddress:
                config.mintAddress,

            startedAt:
                null,

            transactions:
                0,

            error:
                null,

            websocket:
                state.manager
                    ? state.manager.getStats()
                    : null
        });

        console.log(
            `[Tx Engine] HTTP scanner ready: mode=${config.txFetchMode}, batchSize=${config.batchSize}, batchConcurrency=${config.txConcurrency}, scanLimit=${config.txLimit}, timeout=${config.txRequestTimeoutMs}ms, retries=${config.txRetryLimit}.`
        );
        console.log(
            `[Tx Engine] High-Performance SQLite Architecture Started. Target: ${config.mintAddress}`
        );

        /*
         * =================================================
         * Existing historical scanner loop
         * =================================================
         */

        const scanIntervalMs =
            config.scanIntervalMs ||
            30_000;

        while (
            !state.shutdownRequested
        ) {

            const startedAt =
                Date.now();

            /*
             * IMPORTANT:
             *
             * Track the scan promise BEFORE awaiting it.
             *
             * shutdownEngine() can therefore await the exact
             * operation that is touching SQLite.
             */

            const scanPromise =
                state.txRunner.run({
                    wallet:
                        config.mintAddress,

                    limit:
                        config.txLimit
                });

            state.currentScanPromise =
                scanPromise;

            try {

                const result =
                    await scanPromise;

                if (
                    state.shutdownRequested
                ) {
                    break;
                }

                const published =
                    publishState({

                        db:
                            state.db,

                        status:
                            'ready',

                        mintAddress:
                            config.mintAddress,

                        startedAt,

                        transactions:
                            result?.transactions ||
                            0,

                        error:
                            null,

                        websocket:
                            state.manager
                                ? state.manager.getStats()
                                : null
                    });

                console.log(
                    `[Tx Engine] State published. Total transactions: ${published.txState.totalTransactions}, buyers: ${published.latestBuyers.length}`
                );

            } catch (error) {

                if (
                    state.shutdownRequested
                ) {
                    break;
                }

                const message =
                    error?.message ||
                    String(error);

                console.warn(
                    '[Tx Engine Warning] Scan execution failed:',
                    message
                );

                try {

                    const published =
                        publishState({

                            db:
                                state.db,

                            status:
                                'degraded',

                            mintAddress:
                                config.mintAddress,

                            startedAt,

                            transactions:
                                0,

                            error:
                                message,

                            websocket:
                                state.manager
                                    ? state.manager.getStats()
                                    : null
                        });

                    console.warn(
                        `[Tx Engine] Degraded state published. Total transactions: ${published.txState.totalTransactions}, buyers: ${published.latestBuyers.length}`
                    );

                } catch (stateError) {

                    console.error(
                        '[Tx Engine State Error]',
                        stateError?.message ||
                        stateError
                    );
                }

            } finally {

                if (
                    state.currentScanPromise ===
                    scanPromise
                ) {
                    state.currentScanPromise =
                        null;
                }
            }

            if (
                state.shutdownRequested
            ) {
                break;
            }

            const elapsed =
                Date.now() -
                startedAt;

            const waitTime =
                Math.max(
                    scanIntervalMs -
                    elapsed,
                    0
                );

            if (
                elapsed >
                scanIntervalMs
            ) {

                console.log(
                    `[Tx Engine Notice] Scan took longer than interval (${Math.round(elapsed / 1000)}s). Starting next run immediately.`
                );
            }

            if (
                waitTime > 0 &&
                !state.shutdownRequested
            ) {

                await sleep(
                    waitTime
                );
            }
        }

    } finally {

        /*
         * shutdownEngine() is idempotent and shared.
         *
         * If a process signal already triggered shutdown,
         * this awaits the same shutdown promise rather than
         * creating a second shutdown sequence.
         */

        await shutdownEngine();

        runtime =
            null;
    }
}

/*
 * =========================================================
 * Process signals
 * =========================================================
 */

if (
    require.main === module
) {

    let signalReceived =
        false;

    const handleSignal =
        signal => {

            if (
                signalReceived
            ) {
                return;
            }

            signalReceived =
                true;

            console.log(
                `[Tx Engine] Received ${signal}. Shutdown requested...`
            );

            if (
                runtime
            ) {

                runtime.shutdownRequested =
                    true;

                void shutdownEngine()
                    .catch(
                        error => {

                            console.error(
                                '[Tx Engine] Shutdown failed:',
                                error?.message ||
                                error
                            );

                            process.exitCode =
                                1;
                        }
                    );
            }
        };

    process.once(
        'SIGINT',
        () =>
            handleSignal(
                'SIGINT'
            )
    );

    process.once(
        'SIGTERM',
        () =>
            handleSignal(
                'SIGTERM'
            )
    );

    startEngine()
        .catch(
            error => {

                console.error(
                    '[Tx Engine Fatal Error]',
                    error?.message ||
                    error
                );

                process.exitCode =
                    1;
            }
        );
}

/*
 * =========================================================
 * Export
 * =========================================================
 */

module.exports = {
    startEngine,
    publishState,
    shutdownEngine
};
