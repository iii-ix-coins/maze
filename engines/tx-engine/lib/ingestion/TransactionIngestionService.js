'use strict';

const DEFAULT_SOURCE = 'unknown';
const DEFAULT_MAX_BATCH_SIZE = 1000;

class TransactionIngestionService {
    #pendingSignatures = new Map();

    #writer;
    #deduplicator;
    #maxBatchSize;

    #metrics = {
        received: 0,
        accepted: 0,
        duplicates: 0,
        invalid: 0,
        persisted: 0,
        failed: 0,

        batches: 0,
        batchItems: 0,

        bySource: new Map()
    };

    constructor({
        writer,
        deduplicator,
        maxBatchSize = DEFAULT_MAX_BATCH_SIZE
    } = {}) {

        /*
         * -----------------------------------------
         * Writer contract
         * -----------------------------------------
         */

        if (
            !writer ||
            typeof writer.append !== 'function' ||
            typeof writer.flush !== 'function'
        ) {
            throw new TypeError(
                'A TransactionWriter with append() and flush() is required.'
            );
        }

        /*
         * appendMany() is optional.
         * The service does not depend on it.
         */

        /*
         * -----------------------------------------
         * Deduplicator contract
         * -----------------------------------------
         */

        if (
            !deduplicator ||
            typeof deduplicator.reserve !== 'function' ||
            typeof deduplicator.commit !== 'function' ||
            typeof deduplicator.release !== 'function'
        ) {
            throw new TypeError(
                'A TransactionDeduplicator with reserve(), commit(), and release() is required.'
            );
        }

        const safeBatchSize =
            Number(maxBatchSize);

        if (
            !Number.isInteger(safeBatchSize) ||
            safeBatchSize < 1
        ) {
            throw new TypeError(
                'maxBatchSize must be a positive integer.'
            );
        }

        this.#writer =
            writer;

        this.#deduplicator =
            deduplicator;

        this.#maxBatchSize =
            safeBatchSize;
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

        /*
         * Normalized transaction.
         */
        if (
            typeof transaction.signature === 'string' &&
            transaction.signature.trim() !== ''
        ) {
            return transaction.signature.trim();
        }

        /*
         * Raw RPC transaction:
         */
        const nestedSignature =
            transaction
                ?.transaction
                ?.signatures
            ?.[0];

        if (
            typeof nestedSignature === 'string' &&
            nestedSignature.trim() !== ''
        ) {
            return nestedSignature.trim();
        }

        /*
         * Alternate structure.
         */
        const signatures =
            transaction.signatures;

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
     * Source normalization
     * =============================================
     */

    #normalizeSource(
        source
    ) {
        if (
            typeof source !== 'string'
        ) {
            return DEFAULT_SOURCE;
        }

        const normalized =
            source.trim();

        return normalized !== ''
            ? normalized
            : DEFAULT_SOURCE;
    }

    /*
     * =============================================
     * Transaction decoration
     * =============================================
     */

    #decorateTransaction(
        transaction,
        source
    ) {
        return {
            ...transaction,

            ingestion: {
                ...(
                    transaction.ingestion &&
                        typeof transaction.ingestion === 'object'
                        ? transaction.ingestion
                        : {}
                ),

                source,

                /*
                 * This timestamp represents ingestion
                 * into this service, not blockchain time.
                 */
                ingestedAt:
                    new Date().toISOString()
            }
        };
    }

    /*
     * =============================================
     * Source metrics
     * =============================================
     */

    #ensureSourceStats(
        source
    ) {
        let current =
            this.#metrics.bySource.get(
                source
            );

        if (!current) {
            current = {
                received: 0,
                accepted: 0,
                duplicates: 0,
                persisted: 0,
                failed: 0,
                invalid: 0
            };

            this.#metrics.bySource.set(
                source,
                current
            );
        }

        return current;
    }

    #recordSourceReceived(
        source
    ) {
        const stats =
            this.#ensureSourceStats(
                source
            );

        stats.received++;
    }

    #recordSourceAccepted(
        source
    ) {
        const stats =
            this.#ensureSourceStats(
                source
            );

        stats.accepted++;
    }

    #recordSourceDuplicate(
        source
    ) {
        const stats =
            this.#ensureSourceStats(
                source
            );

        stats.duplicates++;
    }

    #recordSourcePersisted(
        source
    ) {
        const stats =
            this.#ensureSourceStats(
                source
            );

        stats.persisted++;
    }

    #recordSourceFailed(
        source
    ) {
        const stats =
            this.#ensureSourceStats(
                source
            );

        stats.failed++;
    }

    #recordSourceInvalid(
        source
    ) {
        const stats =
            this.#ensureSourceStats(
                source
            );

        stats.invalid++;
    }

    /*
     * =============================================
     * Commit signatures that were really flushed
     * =============================================
     *
     * Writer.flush() returns:
     *
     * {
     *   success,
     *   signatures: [...]
     * }
     *
     * We ONLY commit reservations for signatures
     * that the Writer confirms were part of the
     * flushed persistence operation.
     */

    #commitFlushedSignatures(
        flushResult
    ) {
        if (
            !flushResult ||
            !Array.isArray(
                flushResult.signatures
            )
        ) {
            return 0;
        }

        let committedCount = 0;

        const flushedSignatures =
            new Set(
                flushResult.signatures
                    .filter(
                        signature =>
                            typeof signature === 'string' &&
                            signature.trim() !== ''
                    )
                    .map(
                        signature =>
                            signature.trim()
                    )
            );

        for (
            const signature
            of this.#pendingSignatures.keys()
        ) {
            if (
                !flushedSignatures.has(
                    signature
                )
            ) {
                continue;
            }

            const pending =
                this.#pendingSignatures.get(
                    signature
                );

            const committed =
                this.#deduplicator.commit(
                    signature
                );

            this.#pendingSignatures.delete(
                signature
            );

            if (!committed) {
                /*
                 * Extremely defensive:
                 * the reservation should still exist.
                 */
                continue;
            }

            committedCount++;

            /*
             * IMPORTANT:
             *
             * Persistence is counted here,
             * not at append() time.
             */
            this.#metrics.persisted++;

            this.#recordSourcePersisted(
                pending?.source ||
                DEFAULT_SOURCE
            );
        }

        return committedCount;
    }

    /*
     * =============================================
     * Release pending reservations
     * =============================================
     */

    #releasePendingSignatures() {
        let releasedCount = 0;

        for (
            const signature
            of this.#pendingSignatures.keys()
        ) {
            const pending =
                this.#pendingSignatures.get(
                    signature
                );

            const released =
                this.#deduplicator.release(
                    signature
                );

            this.#pendingSignatures.delete(
                signature
            );

            if (released) {
                releasedCount++;
            }

            this.#metrics.failed++;

            this.#recordSourceFailed(
                pending?.source ||
                DEFAULT_SOURCE
            );
        }

        return releasedCount;
    }

    /*
     * =============================================
     * Single ingestion
     * =============================================
     */

    async ingest(
        transaction,
        {
            source = DEFAULT_SOURCE
        } = {}
    ) {

        this.#metrics.received++;

        const normalizedSource =
            this.#normalizeSource(
                source
            );

        this.#recordSourceReceived(
            normalizedSource
        );

        /*
         * -----------------------------------------
         * Validate transaction
         * -----------------------------------------
         */

        if (
            !transaction ||
            typeof transaction !== 'object' ||
            Array.isArray(transaction)
        ) {
            this.#metrics.invalid++;

            this.#recordSourceInvalid(
                normalizedSource
            );

            this.#recordSourceFailed(
                normalizedSource
            );

            return {
                accepted: false,
                persisted: false,
                duplicate: false,

                signature: null,

                source:
                    normalizedSource,

                reason:
                    'invalid-transaction'
            };
        }

        /*
         * -----------------------------------------
         * Extract signature
         * -----------------------------------------
         */

        const signature =
            this.#extractSignature(
                transaction
            );

        if (!signature) {
            this.#metrics.invalid++;

            this.#recordSourceInvalid(
                normalizedSource
            );

            this.#recordSourceFailed(
                normalizedSource
            );

            return {
                accepted: false,
                persisted: false,
                duplicate: false,

                signature: null,

                source:
                    normalizedSource,

                reason:
                    'missing-signature'
            };
        }

        /*
         * -----------------------------------------
         * Reserve signature
         * -----------------------------------------
         */

        const reservation =
            this.#deduplicator.reserve(
                signature
            );

        if (
            !reservation ||
            !reservation.accepted
        ) {
            this.#metrics.duplicates++;

            this.#recordSourceDuplicate(
                normalizedSource
            );

            return {
                accepted: false,
                persisted: false,
                duplicate: true,

                signature,

                source:
                    normalizedSource,

                reason:
                    reservation?.reason ||
                    'duplicate'
            };
        }

        /*
         * Accepted by deduplication layer.
         */
        this.#metrics.accepted++;

        this.#recordSourceAccepted(
            normalizedSource
        );

        const decorated =
            this.#decorateTransaction(
                transaction,
                normalizedSource
            );

        /*
         * -----------------------------------------
         * Writer
         * -----------------------------------------
         */

        try {

            const writerResult =
                await this.#writer.append(
                    decorated
                );

            /*
             * append() may have persisted the
             * transaction immediately because its
             * buffer reached the configured size.
             */

            if (
                writerResult?.persisted === true &&
                writerResult?.flushed === true
            ) {

                /*
                 * Current transaction was part of
                 * the successful flush.
                 *
                 * IMPORTANT:
                 * #commitFlushedSignatures()
                 * also commits any older pending
                 * transactions that were flushed
                 * in the same batch.
                 */
                if (
                    Array.isArray(
                        writerResult?.flushResult
                            ?.signatures
                    )
                ) {
                    this.#commitFlushedSignatures(
                        writerResult.flushResult
                    );
                } else {
                    /*
                     * Defensive fallback.
                     */
                    const committed =
                        this.#deduplicator.commit(
                            signature
                        );

                    if (committed) {
                        this.#metrics.persisted++;

                        this.#recordSourcePersisted(
                            normalizedSource
                        );
                    }
                }

                return {
                    accepted: true,

                    persisted: true,

                    duplicate:
                        writerResult.duplicate === true,

                    signature,

                    source:
                        normalizedSource,

                    reason:
                        writerResult.duplicate === true
                            ? 'already-persisted'
                            : 'persisted',

                    writer:
                        writerResult
                };
            }

            /*
             * -------------------------------------
             * Buffered but not yet persisted
             * -------------------------------------
             */

            this.#pendingSignatures.set(
                signature,
                {
                    source:
                        normalizedSource
                }
            );

            return {
                accepted: true,

                persisted: false,

                duplicate: false,

                buffered:
                    writerResult?.buffered !== false,

                flushed:
                    writerResult?.flushed === true,

                signature,

                source:
                    normalizedSource,

                reason:
                    'buffered',

                writer:
                    writerResult
            };

        } catch (error) {

            /*
             * Writer rejected the transaction.
             *
             * Reservation must become available
             * again so a recovery attempt can retry.
             */

            this.#deduplicator.release(
                signature
            );

            this.#metrics.failed++;

            this.#recordSourceFailed(
                normalizedSource
            );

            throw error;
        }
    }

    /*
     * =============================================
     * Batch ingestion
     * =============================================
     */

    async ingestMany(
        transactions,
        {
            source = DEFAULT_SOURCE
        } = {}
    ) {

        if (
            !Array.isArray(
                transactions
            )
        ) {
            throw new TypeError(
                'transactions must be an array.'
            );
        }

        if (
            transactions.length >
            this.#maxBatchSize
        ) {
            throw new RangeError(
                `Batch size ${transactions.length} exceeds maximum ${this.#maxBatchSize}.`
            );
        }

        this.#metrics.batches++;

        this.#metrics.batchItems +=
            transactions.length;

        const results = [];

        let accepted = 0;
        let persisted = 0;
        let duplicates = 0;
        let failed = 0;
        let invalid = 0;

        /*
         * Sequential ingestion is intentional.
         *
         * It gives us deterministic reservation /
         * buffer ordering and lets Writer control
         * actual batching.
         */
        for (
            const transaction
            of transactions
        ) {

            try {

                const result =
                    await this.ingest(
                        transaction,
                        {
                            source
                        }
                    );

                results.push(
                    result
                );

                if (
                    result.accepted
                ) {
                    accepted++;
                }

                if (
                    result.persisted
                ) {
                    persisted++;
                }

                if (
                    result.duplicate
                ) {
                    duplicates++;
                }

                if (
                    result.reason ===
                    'invalid-transaction' ||
                    result.reason ===
                    'missing-signature'
                ) {
                    invalid++;
                }

            } catch (error) {

                failed++;

                results.push({
                    accepted: false,

                    persisted: false,

                    duplicate: false,

                    signature:
                        this.#extractSignature(
                            transaction
                        ),

                    source:
                        this.#normalizeSource(
                            source
                        ),

                    error
                });
            }
        }

        /*
         * Do not blindly flush here before returning
         * unless caller explicitly expects a batch
         * persistence boundary.
         *
         * The service keeps Writer semantics intact.
         */

        return {
            received:
                transactions.length,

            accepted,

            persisted,

            duplicates,

            failed,

            invalid,

            results
        };
    }

    /*
     * =============================================
     * Explicit persistence boundary
     * =============================================
     *
     * Caller uses:
     *
     * await ingestion.flush()
     *
     * to force buffered records into SQLite.
     */

    async flush() {

        try {

            const result =
                await this.#writer.flush();

            const committedCount =
                this.#commitFlushedSignatures(
                    result
                );

            return {
                ...(
                    result || {}
                ),

                committed:
                    committedCount
            };

        } catch (error) {

            /*
             * Nothing that remained pending may
             * continue occupying deduplication.
             *
             * The Writer has already restored its
             * failed batch into its own buffer.
             *
             * Therefore reservations are released
             * and a later retry can ingest them again.
             */
            this.#releasePendingSignatures();

            throw error;
        }
    }

    /*
     * =============================================
     * Lifecycle
     * =============================================
     */

    async close() {
        await this.flush();
    }

    /*
     * =============================================
     * Introspection
     * =============================================
     */

    pendingSize() {
        return this.#pendingSignatures.size;
    }

    stats() {

        const bySource = {};

        for (
            const [
                source,
                stats
            ]
            of this.#metrics.bySource.entries()
        ) {
            bySource[source] = {
                ...stats
            };
        }

        return {
            received:
                this.#metrics.received,

            accepted:
                this.#metrics.accepted,

            duplicates:
                this.#metrics.duplicates,

            invalid:
                this.#metrics.invalid,

            persisted:
                this.#metrics.persisted,

            failed:
                this.#metrics.failed,

            batches:
                this.#metrics.batches,

            batchItems:
                this.#metrics.batchItems,

            pending:
                this.#pendingSignatures.size,

            bySource
        };
    }

    resetMetrics() {

        this.#metrics.received = 0;
        this.#metrics.accepted = 0;
        this.#metrics.duplicates = 0;
        this.#metrics.invalid = 0;
        this.#metrics.persisted = 0;
        this.#metrics.failed = 0;

        this.#metrics.batches = 0;
        this.#metrics.batchItems = 0;

        this.#metrics.bySource.clear();
    }
}

module.exports =
    TransactionIngestionService;