'use strict';

const {
    createTxEngine
} = require('./TxEngine/TxEngineFactory');

const SignatureScanner =
    require('./TxEngine/scanner/SignatureScanner');

const ResumeScanner =
    require('./TxEngine/scanner/ResumeScanner');

const TransactionScanner =
    require('./TxEngine/scanner/TransactionScanner');

const TransactionWriter =
    require('./TxEngine/storage/transactionWriter');

const TransactionState =
    require('./TxEngine/storage/transactionState');

const TransactionHistory =
    require('./TxEngine/storage/transactionHistory');

const TxPipeline =
    require('./TxPipeline');

const {
    config
} = require('../config');

class TxRunner {

    #pipeline;

    #txEngine;

    #transactionState;

    #transactionHistory;

    #transactionWriter;

    #resumeScanner;

    #transactionScanner;

    #runPromise = null;

    /*
     * =================================================
     * Constructor
     * =================================================
     */

    constructor(
        db,
        options = {}
    ) {

        if (
            !db
        ) {
            throw new Error(
                'Database instance required for TxRunner.'
            );
        }

        if (
            typeof db.getState !== 'function' ||
            typeof db.updateState !== 'function'
        ) {
            throw new TypeError(
                'Database must implement getState() and updateState().'
            );
        }

        /*
         * ---------------------------------------------
         * Normalize options
         * ---------------------------------------------
         */

        const concurrency =
            Number.isInteger(
                options.concurrency
            ) &&
                options.concurrency > 0
                ? options.concurrency
                : config.txConcurrency;

        const timeout =
            Number.isInteger(
                options.timeout
            ) &&
                options.timeout > 0
                ? options.timeout
                : config.txRequestTimeoutMs;

        const batchSize =
            Number.isInteger(
                options.batchSize
            ) &&
                options.batchSize > 0
                ? options.batchSize
                : (
                    Number.isInteger(
                        config.batchSize
                    ) &&
                        config.batchSize > 0
                        ? config.batchSize
                        : 25
                );

        const batchConcurrency =
            Number.isInteger(options.batchConcurrency) && options.batchConcurrency > 0
                ? options.batchConcurrency
                : config.txConcurrency;

        const writerBufferSize =
            Number.isInteger(
                options.writerBufferSize
            ) &&
                options.writerBufferSize > 0
                ? options.writerBufferSize
                : 100;

        /*
         * ---------------------------------------------
         * Historical transaction engine
         * ---------------------------------------------
         *
         * IMPORTANT:
         *
         * This engine is completely independent
         * from the realtime WebSocket subsystem.
         *
         * It remains the recovery / historical path.
         */

        this.#txEngine =
            createTxEngine({
                concurrency,
                timeout,
                retries: options.retries ?? config.txRetryLimit,
                retryDelay: options.retryDelay ?? config.txRetryBaseDelayMs,
                mode: options.mode ?? config.txFetchMode,
                commitment: options.commitment ?? config.commitment,
                cacheMaxEntries: options.cacheMaxEntries ?? config.txCacheMaxEntries
            });

        /*
         * ---------------------------------------------
         * Persistent historical state
         * ---------------------------------------------
         */

        this.#transactionState =
            new TransactionState(
                db
            );

        /*
         * ---------------------------------------------
         * Per-run signature history
         * ---------------------------------------------
         *
         * Prevents duplicate signatures from being
         * emitted more than once inside one historical
         * scan.
         */

        this.#transactionHistory =
            new TransactionHistory();

        /*
         * ---------------------------------------------
         * Historical signature scanner
         * ---------------------------------------------
         */

        const signatureScanner =
            new SignatureScanner({
                txEngine:
                    this.#txEngine,

                history:
                    this.#transactionHistory
            });

        /*
         * ---------------------------------------------
         * Resume scanner
         * ---------------------------------------------
         *
         * Reads tx_state.lastSignature and resumes
         * historical scanning from that boundary.
         */

        this.#resumeScanner =
            new ResumeScanner({
                signatureScanner,

                transactionState:
                    this.#transactionState
            });

        /*
         * ---------------------------------------------
         * Historical transaction scanner
         * ---------------------------------------------
         *
         * Existing Helius enhanced batch fetching
         * remains untouched.
         */

        this.#transactionScanner =
            new TransactionScanner({
                txEngine:
                    this.#txEngine,

                enhanced:
                    options.enhanced !== false,

                batchSize,

                batchConcurrency
            });

        /*
         * ---------------------------------------------
         * Historical writer
         * ---------------------------------------------
         *
         * This is intentionally a separate writer
         * instance from the realtime WebSocket writer.
         *
         * Both writers use the SAME SQLite database,
         * but each maintains its own in-memory buffer.
         *
         * TransactionDeduplicator remains above them
         * on the realtime path.
         */

        this.#transactionWriter =
            options.transactionWriter ||
            new TransactionWriter(
                db,
                config.mintAddress,
                {
                    bufferSize:
                        writerBufferSize,

                    source:
                        'helius-batch'
                }
            );

        if (
            !this.#transactionWriter ||
            typeof this.#transactionWriter.open !==
            'function' ||
            typeof this.#transactionWriter.append !==
            'function' ||
            typeof this.#transactionWriter.flush !==
            'function' ||
            typeof this.#transactionWriter.close !==
            'function'
        ) {
            throw new TypeError(
                'transactionWriter must implement open(), append(), flush(), and close().'
            );
        }

        /*
         * ---------------------------------------------
         * Final historical pipeline
         * ---------------------------------------------
         */

        this.#pipeline =
            new TxPipeline({
                resumeScanner:
                    this.#resumeScanner,

                transactionScanner:
                    this.#transactionScanner,

                transactionWriter:
                    this.#transactionWriter,

                transactionState:
                    this.#transactionState
            });
    }

    /*
     * =================================================
     * Run
     * =================================================
     *
     * A single TxRunner instance may not execute two
     * historical scans simultaneously.
     *
     * This is important because both executions would
     * share:
     *
     * - the same tx_state row
     * - the same writer
     * - the same TransactionHistory
     *
     * and could otherwise corrupt cursor semantics.
     */

    async run({
        wallet,
        until,
        limit = 1000,
        saveEvery = 100
    } = {}) {

        if (
            typeof wallet !== 'string' ||
            wallet.trim() === ''
        ) {
            throw new TypeError(
                'Invalid wallet.'
            );
        }

        if (
            this.#runPromise
        ) {
            throw new Error(
                'TxRunner is already running a historical scan.'
            );
        }

        const normalizedWallet =
            wallet.trim();

        const normalizedLimit =
            Number.isInteger(limit) &&
                limit > 0
                ? limit
                : 1000;

        const normalizedSaveEvery =
            Number.isInteger(saveEvery) &&
                saveEvery > 0
                ? saveEvery
                : 100;

        const runPromise =
            this.#executeRun({
                wallet:
                    normalizedWallet,

                until,

                limit:
                    normalizedLimit,

                saveEvery:
                    normalizedSaveEvery
            });

        this.#runPromise =
            runPromise;

        try {

            return await runPromise;

        } finally {

            if (
                this.#runPromise ===
                runPromise
            ) {
                this.#runPromise =
                    null;
            }
        }
    }

    /*
     * =================================================
     * Internal run wrapper
     * =================================================
     */

    async #executeRun({
        wallet,
        until,
        limit,
        saveEvery
    }) {

        /*
         * Reset per-run in-memory history.
         *
         * Persistent SQLite state is NOT reset.
         */

        this.#transactionHistory.clear();
        // The cache exists only to deduplicate work inside one scan. Keeping
        // it across polling cycles can suppress a DB retry after a failed write.
        this.#txEngine.clearCache();

        return this.#pipeline.run({

            wallet,

            until,

            limit,

            saveEvery

        });
    }

    /*
     * =================================================
     * State / health access
     * =================================================
     */

    async state() {

        return this.#transactionState.load();
    }

    isRunning() {

        return this.#runPromise !== null;
    }

    /*
     * =================================================
     * Writer inspection
     * =================================================
     */

    writerStats() {

        if (
            typeof this.#transactionWriter.stats !==
            'function'
        ) {
            return null;
        }

        return this.#transactionWriter.stats();
    }

    /*
     * =================================================
     * Engine inspection
     * =================================================
     */

    engineStats() {

        return {
            cacheSize:
                typeof this.#txEngine.cacheSize ===
                    'function'
                    ? this.#txEngine.cacheSize()
                    : null
        };
    }

    /*
     * =================================================
     * Pipeline inspection
     * =================================================
     */

    getPipeline() {

        return this.#pipeline;
    }

    getTransactionWriter() {

        return this.#transactionWriter;
    }

    getTransactionState() {

        return this.#transactionState;
    }

    getTransactionHistory() {

        return this.#transactionHistory;
    }

    getTransactionEngine() {

        return this.#txEngine;
    }
}

module.exports =
    TxRunner;
