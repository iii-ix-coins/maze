'use strict';

class TxPipeline {
    #resumeScanner;
    #transactionScanner;
    #transactionWriter;
    #transactionState;

    constructor({
        resumeScanner,
        transactionScanner,
        transactionWriter,
        transactionState
    } = {}) {

        if (!resumeScanner) {
            throw new Error(
                'resumeScanner is required.'
            );
        }

        if (!transactionScanner) {
            throw new Error(
                'transactionScanner is required.'
            );
        }

        if (!transactionWriter) {
            throw new Error(
                'transactionWriter is required.'
            );
        }

        if (!transactionState) {
            throw new Error(
                'transactionState is required.'
            );
        }

        if (
            typeof transactionWriter.open !== 'function' ||
            typeof transactionWriter.append !== 'function' ||
            typeof transactionWriter.flush !== 'function' ||
            typeof transactionWriter.close !== 'function'
        ) {
            throw new TypeError(
                'transactionWriter must implement open(), append(), flush(), and close().'
            );
        }

        if (
            typeof transactionState.load !== 'function' ||
            typeof transactionState.update !== 'function'
        ) {
            throw new TypeError(
                'transactionState must implement load() and update().'
            );
        }

        this.#resumeScanner =
            resumeScanner;

        this.#transactionScanner =
            transactionScanner;

        this.#transactionWriter =
            transactionWriter;

        this.#transactionState =
            transactionState;
    }

    /*
     * =============================================
     * Signature extraction
     * =============================================
     */

    #extractSignature(
        transaction
    ) {

        if (
            !transaction ||
            typeof transaction !== 'object'
        ) {
            return null;
        }

        if (
            typeof transaction.signature === 'string' &&
            transaction.signature.trim() !== ''
        ) {
            return transaction.signature.trim();
        }

        const nested =
            transaction
                ?.transaction
                ?.signatures
            ?.[0];

        if (
            typeof nested === 'string' &&
            nested.trim() !== ''
        ) {
            return nested.trim();
        }

        const signatures =
            transaction?.signatures;

        if (
            Array.isArray(signatures) &&
            typeof signatures[0] === 'string' &&
            signatures[0].trim() !== ''
        ) {
            return signatures[0].trim();
        }

        return null;
    }

    /*
     * =============================================
     * Safe integer helper
     * =============================================
     */

    #toNonNegativeInteger(
        value,
        fallback = 0
    ) {

        const number =
            Number(value);

        if (
            Number.isSafeInteger(number) &&
            number >= 0
        ) {
            return number;
        }

        return fallback;
    }

    /*
     * =============================================
     * Flush result normalization
     * =============================================
     */

    #normalizeFlushResult(
        result
    ) {

        return {
            success:
                result?.success !== false,

            received:
                this.#toNonNegativeInteger(
                    result?.received,
                    0
                ),

            inserted:
                this.#toNonNegativeInteger(
                    result?.inserted,
                    0
                ),

            duplicates:
                this.#toNonNegativeInteger(
                    result?.duplicates,
                    0
                ),

            invalid:
                this.#toNonNegativeInteger(
                    result?.invalid,
                    0
                ),

            persisted:
                this.#toNonNegativeInteger(
                    result?.persisted,
                    0
                ),

            failed:
                this.#toNonNegativeInteger(
                    result?.failed,
                    0
                ),

            signatures:
                Array.isArray(
                    result?.signatures
                )
                    ? result.signatures.filter(
                        signature =>
                            typeof signature === 'string' &&
                            signature.trim() !== ''
                    ).map(
                        signature =>
                            signature.trim()
                    )
                    : []
        };
    }

    /*
     * =============================================
     * State save
     * =============================================
     *
     * IMPORTANT:
     *
     * lastSignature is only allowed to move
     * forward at a persistence boundary.
     *
     * WebSocket ingestion does not call this
     * method.
     */

    async #saveState({
        mintAddress,
        lastSignature,
        oldestSignature,
        scanCursorSignature,
        scanHeadSignature,
        totalTransactions,
        scanCompleted
    }) {

        return this.#transactionState.update({

            version: 1,

            mintAddress,

            lastSignature:
                lastSignature || null,

            oldestSignature:
                oldestSignature || null,

            scanCursorSignature:
                scanCursorSignature || null,

            scanHeadSignature:
                scanHeadSignature || null,

            totalTransactions:
                this.#toNonNegativeInteger(
                    totalTransactions,
                    0
                ),

            scanCompleted:
                Boolean(scanCompleted)
        });
    }

    /*
     * =============================================
     * Apply a successful flush
     * =============================================
     *
     * The Writer returns the signatures that
     * belonged to the flushed persistence unit.
     *
     * We use that list as the authoritative
     * persistence boundary.
     */

    #applyFlushBoundary(
        flushResult,
        runtimeState
    ) {

        const result =
            this.#normalizeFlushResult(
                flushResult
            );

        if (
            !result.success
        ) {
            return {
                success: false,
                persistedCount: 0,
                lastSignature:
                    runtimeState.lastPersistedSignature,
                oldestSignature:
                    runtimeState.oldestPersistedSignature
            };
        }

        const signatures =
            result.signatures;

        if (
            signatures.length === 0
        ) {
            return {
                success: true,

                persistedCount:
                    0,

                lastSignature:
                    runtimeState.lastPersistedSignature,

                oldestSignature:
                    runtimeState.oldestPersistedSignature
            };
        }

        /*
         * Historical scanner yields transactions
         * in the order used by the resume cursor.
         *
         * The signature scanner yields newest-to-oldest.
         * Therefore:
         *
         * first  = newest transaction in flush
         * last   = oldest transaction in flush
         *
         * IMPORTANT:
         * The cursor used by ResumeScanner must
         * point to the OLDEST processed signature,
         * because scanning proceeds backwards.
         */

        runtimeState.oldestPersistedSignature =
            signatures[signatures.length - 1];

        runtimeState.lastPersistedSignature =
            signatures[signatures.length - 1];

        runtimeState.persistedInRun +=
            signatures.length;

        return {
            success: true,

            persistedCount:
                signatures.length,

            lastSignature:
                runtimeState.lastPersistedSignature,

            oldestSignature:
                runtimeState.oldestPersistedSignature
        };
    }

    /*
     * =============================================
     * Run
     * =============================================
     */

    async run({
        wallet,
        until,
        limit = 1000,
        saveEvery = 100
    }) {

        /*
         * -----------------------------------------
         * Validate wallet
         * -----------------------------------------
         */

        if (
            typeof wallet !== 'string' ||
            wallet.trim() === ''
        ) {
            throw new TypeError(
                'Invalid wallet.'
            );
        }

        /*
         * -----------------------------------------
         * Normalize runtime parameters
         * -----------------------------------------
         */

        const effectiveLimit =
            Number.isInteger(limit) &&
                limit > 0
                ? limit
                : 1000;

        const effectiveSaveEvery =
            Number.isInteger(saveEvery) &&
                saveEvery > 0
                ? saveEvery
                : 100;

        /*
         * -----------------------------------------
         * Open writer
         * -----------------------------------------
         */

        await this.#transactionWriter.open();

        /*
         * -----------------------------------------
         * Load state BEFORE this run
         * -----------------------------------------
         */

        const initialState =
            await this.#transactionState.load();

        const baseTotalTransactions =
            this.#toNonNegativeInteger(
                initialState?.totalTransactions,
                0
            );

        /*
         * Runtime-only state.
         *
         * These variables represent this run,
         * not WebSocket state.
         */

        const runtimeState = {

            /*
             * Number of transactions successfully
             * passed through the historical pipeline.
             */
            processedInRun:
                0,

            /*
             * Number of signatures that have
             * crossed a Writer flush boundary.
             */
            persistedInRun:
                0,

            /*
             * Last signature known to be persisted.
             */
            lastPersistedSignature:
                null,

            /*
             * Oldest signature known to be persisted.
             */
            oldestPersistedSignature:
                null,

            /*
             * Last transaction encountered but not
             * necessarily persisted yet.
             *
             * This must NEVER directly become
             * tx_state.lastSignature.
             */
            lastSeenSignature:
                null,

            oldestSeenSignature:
                null,

            /*
             * Number of transactions already
             * represented by the state checkpoint.
             */
            checkpointProcessed:
                0
        };

        let scanCompleted =
            false;

        /*
         * =========================================
         * Flush + checkpoint
         * =========================================
         */

        const flushAndCheckpoint =
            async ({ completed = false } = {}) => {
                const flushResult = await this.#transactionWriter.flush();
                const boundary = this.#applyFlushBoundary(flushResult, runtimeState);

                if (!boundary.success) {
                    throw new Error('TransactionWriter flush failed.');
                }

                const checkpointSignature =
                    boundary.lastSignature || runtimeState.lastPersistedSignature;
                const checkpointOldestSignature =
                    boundary.oldestSignature || runtimeState.oldestPersistedSignature;
                const scanStatus = this.#resumeScanner.lastScanStatus?.() || null;
                const hasCompletedBoundary = Boolean(initialState?.lastSignature);

                // `lastSignature` is the newest fully processed watermark, because
                // getSignaturesForAddress(..., { until }) asks for signatures newer
                // than that signature. `scanCursorSignature` is the oldest processed
                // point in a pending backlog, and `scanHeadSignature` remembers the
                // newest signature that will become the watermark once the backlog
                // reaches the old boundary.
                let nextLastSignature = initialState?.lastSignature || null;
                let nextScanCursorSignature = initialState?.scanCursorSignature || null;
                let nextScanHeadSignature = initialState?.scanHeadSignature || null;
                let nextScanCompleted = false;

                if (!hasCompletedBoundary && completed) {
                    // Bootstrap stays intentionally bounded: seed the newest edge and
                    // do not backfill an unbounded token history on first launch.
                    nextLastSignature = scanStatus?.newestSignature || nextLastSignature;
                    nextScanCursorSignature = null;
                    nextScanHeadSignature = null;
                    nextScanCompleted = true;
                } else if (completed && scanStatus?.caughtUp === true) {
                    // The entire pending range has been persisted. Only now advance
                    // the live polling watermark to the remembered newest signature.
                    nextLastSignature =
                        nextScanHeadSignature ||
                        scanStatus?.newestSignature ||
                        initialState?.lastSignature ||
                        null;
                    nextScanCursorSignature = null;
                    nextScanHeadSignature = null;
                    nextScanCompleted = true;
                } else {
                    // Limit or intermediate checkpoint: preserve the old live
                    // watermark and keep a resumable cursor for the pending range.
                    nextLastSignature = initialState?.lastSignature || null;
                    nextScanCursorSignature = hasCompletedBoundary
                        ? (checkpointSignature || initialState?.scanCursorSignature || null)
                        : null;
                    nextScanHeadSignature = hasCompletedBoundary
                        ? (nextScanHeadSignature || scanStatus?.newestSignature || null)
                        : null;
                    nextScanCompleted = false;
                }

                const runDelta =
                    runtimeState.processedInRun - runtimeState.checkpointProcessed;
                const nextTotal = baseTotalTransactions + runtimeState.processedInRun;

                await this.#saveState({
                    mintAddress: wallet,
                    lastSignature: nextLastSignature,
                    oldestSignature:
                        checkpointOldestSignature || initialState?.oldestSignature || null,
                    scanCursorSignature: nextScanCursorSignature,
                    scanHeadSignature: nextScanHeadSignature,
                    totalTransactions: nextTotal,
                    scanCompleted: nextScanCompleted
                });

                runtimeState.checkpointProcessed = runtimeState.processedInRun;

                return {
                    flushResult,
                    boundary,
                    processedSinceCheckpoint: runDelta,
                    totalTransactions: nextTotal,
                    scanCompleted: nextScanCompleted,
                    scanStatus
                };
            };

        /*
         * =========================================
         * Main scan
         * =========================================
         */

        try {

            const signatures =
                this.#resumeScanner.scan({

                    wallet,

                    until,

                    limit:
                        effectiveLimit

                });

            for await (
                const transaction
                of this.#transactionScanner.scan(
                    signatures
                )
            ) {

                const signature =
                    this.#extractSignature(
                        transaction
                    );

                /*
                 * Invalid transaction without
                 * signature cannot become part of
                 * historical cursor state.
                 */
                if (
                    !signature
                ) {
                    console.warn(
                        '[Tx Pipeline] Transaction without signature skipped.'
                    );

                    continue;
                }

                /*
                 * Track seen transaction.
                 *
                 * It is NOT persisted state yet.
                 */
                runtimeState.lastSeenSignature =
                    signature;

                if (
                    !runtimeState.oldestSeenSignature
                ) {
                    runtimeState.oldestSeenSignature =
                        signature;
                }

                /*
                 * ---------------------------------
                 * Persist into Writer
                 * ---------------------------------
                 */

                const appendResult =
                    await this.#transactionWriter.append(
                        transaction
                    );

                /*
                 * Transaction successfully accepted
                 * by the Writer.
                 */
                if (
                    appendResult?.accepted !== false
                ) {
                    runtimeState.processedInRun++;
                }

                /*
                 * ---------------------------------
                 * Auto-flush detection
                 * ---------------------------------
                 *
                 * Writer may have flushed because its
                 * internal buffer became full.
                 */

                if (
                    appendResult?.flushed === true &&
                    appendResult?.flushResult
                ) {

                    const boundary =
                        this.#applyFlushBoundary(
                            appendResult.flushResult,
                            runtimeState
                        );

                    if (
                        !boundary.success
                    ) {
                        throw new Error(
                            'Automatic Writer flush failed.'
                        );
                    }
                }

                /*
                 * ---------------------------------
                 * Explicit checkpoint
                 * ---------------------------------
                 */

                if (
                    runtimeState.processedInRun > 0 &&
                    runtimeState.processedInRun %
                    effectiveSaveEvery === 0
                ) {

                    const checkpoint =
                        await flushAndCheckpoint({
                            completed: false
                        });

                    console.log(
                        `[Tx Engine] Historical checkpoint saved: ${runtimeState.processedInRun} transactions processed.`
                    );

                    if (
                        checkpoint.totalTransactions <
                        baseTotalTransactions
                    ) {
                        throw new Error(
                            'Historical transaction state moved backwards unexpectedly.'
                        );
                    }
                }
            }

            /*
             * =========================================
             * Final flush + final checkpoint
             * =========================================
             */

            const finalCheckpoint =
                await flushAndCheckpoint({
                    completed: true
                });

            scanCompleted =
                true;

            /*
             * If no new transaction was processed,
             * preserve existing state.
             */

            const finalState =
                await this.#transactionState.load();

            console.log(
                `[Tx Engine] Scan completed: ${runtimeState.processedInRun} new transactions.`
            );

            return {

                transactions:
                    runtimeState.processedInRun,

                persistedTransactions:
                    runtimeState.persistedInRun,

                totalTransactions:
                    finalCheckpoint.totalTransactions,

                lastSignature:
                    finalState?.lastSignature ??
                    runtimeState.lastPersistedSignature,

                oldestSignature:
                    finalState?.oldestSignature ??
                    runtimeState.oldestPersistedSignature,

                scanCompleted:
                    finalState?.scanCompleted === true,

                scanCursorSignature:
                    finalState?.scanCursorSignature ?? null,

                scanHeadSignature:
                    finalState?.scanHeadSignature ?? null,

                caughtUp:
                    finalState?.scanCompleted === true
            };

        } catch (error) {

            /*
             * =========================================
             * Recovery path
             * =========================================
             *
             * We attempt ONE final flush.
             *
             * Anything successfully flushed becomes
             * eligible for state checkpoint.
             */

            try {

                const recoveryFlush =
                    await this.#transactionWriter.flush();

                const recoveryBoundary =
                    this.#applyFlushBoundary(
                        recoveryFlush,
                        runtimeState
                    );

                if (
                    recoveryBoundary.success
                ) {

                    const recoveryTotal =
                        baseTotalTransactions +
                        runtimeState.processedInRun;

                    await this.#saveState({

                        mintAddress:
                            wallet,

                        /*
                         * Never use lastSeenSignature here.
                         */
                        // Do not advance the completed watermark on failure.
                        // Continue from the last confirmed persistence boundary.
                        lastSignature:
                            initialState?.lastSignature || null,

                        oldestSignature:
                            runtimeState.oldestPersistedSignature ||
                            initialState?.oldestSignature || null,

                        scanCursorSignature:
                            initialState?.lastSignature
                                ? (runtimeState.lastPersistedSignature || initialState?.scanCursorSignature || null)
                                : null,

                        scanHeadSignature:
                            initialState?.lastSignature
                                ? (initialState?.scanHeadSignature || this.#resumeScanner.lastScanStatus?.()?.newestSignature || null)
                                : null,

                        totalTransactions:
                            recoveryTotal,

                        scanCompleted:
                            false
                    });

                    runtimeState.checkpointProcessed =
                        runtimeState.processedInRun;
                }

            } catch (flushError) {

                console.error(
                    '[Tx Engine] Recovery flush failed:',
                    flushError?.message ||
                    flushError
                );

                /*
                 * IMPORTANT:
                 *
                 * Do NOT move tx_state cursor forward
                 * if we cannot prove persistence.
                 */
            }

            /*
             * Original error remains authoritative.
             */

            throw error;

        } finally {

            /*
             * =========================================
             * Single writer shutdown boundary
             * =========================================
             *
             * close() itself performs its final flush.
             *
             * We therefore DO NOT call flush() again
             * here.
             */

            try {

                await this.#transactionWriter.close();

            } catch (closeError) {

                /*
                 * If the main run already failed,
                 * preserve that failure.
                 *
                 * close errors are logged because the
                 * original exception is more actionable.
                 */

                console.error(
                    '[Tx Engine] TransactionWriter close failed:',
                    closeError?.message ||
                    closeError
                );

                if (
                    scanCompleted
                ) {
                    throw closeError;
                }
            }

            if (
                !scanCompleted
            ) {
                console.warn(
                    '[Tx Engine] Scan did not complete successfully.'
                );
            }
        }
    }
}

module.exports =
    TxPipeline;