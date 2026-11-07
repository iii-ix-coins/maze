'use strict';

const BuyerDetector =
    require('../../buyerDetector');

const DEFAULT_BUFFER_SIZE = 100;
const DEFAULT_SOURCE = 'unknown';

class TransactionWriter {
    #buffer = [];
    #bufferSize = DEFAULT_BUFFER_SIZE;
    #buyerDetector = null;
    #db = null;

    #opened = false;
    #closed = false;

    #flushPromise = null;

    #stats = {
        appended: 0,
        ignored: 0,

        flushRequested: 0,
        flushCompleted: 0,

        received: 0,
        inserted: 0,
        duplicates: 0,
        invalid: 0,

        buyerReceived: 0,
        buyerInserted: 0,
        buyerDuplicates: 0,
        buyerInvalid: 0,

        persisted: 0,
        persistenceFailures: 0
    };

    constructor(
        db,
        mintAddress,
        options = {}
    ) {
        if (!db) {
            throw new Error(
                'Database instance required for TransactionWriter.'
            );
        }

        if (
            typeof db.insertRawTransactionsBatch !==
            'function' ||
            typeof db.insertBuyersBatch !==
            'function'
        ) {
            throw new TypeError(
                'Database must implement raw and buyer persistence methods.'
            );
        }

        this.#db = db;

        const configuredBufferSize =
            Number(
                options.bufferSize
            );

        this.#bufferSize =
            Number.isInteger(
                configuredBufferSize
            ) &&
                configuredBufferSize > 0
                ? configuredBufferSize
                : DEFAULT_BUFFER_SIZE;

        if (mintAddress) {
            this.#buyerDetector =
                new BuyerDetector(
                    mintAddress
                );
        }

        this.source =
            this.#normalizeSource(
                options.source
            );

        this.autoFlush =
            options.autoFlush !== false;
    }

    /*
     * =============================================
     * Lifecycle
     * =============================================
     */

    async open() {
        if (
            this.#opened &&
            !this.#closed
        ) {
            return;
        }

        this.#buffer = [];
        this.#opened = true;
        this.#closed = false;
    }

    isOpen() {
        return (
            this.#opened &&
            !this.#closed
        );
    }

    assertOpen() {
        if (!this.isOpen()) {
            throw new Error(
                'TransactionWriter is not open.'
            );
        }
    }

    async close() {
        if (this.#closed) {
            return {
                success: true,
                flushed: false
            };
        }

        let result;

        try {
            result =
                await this.flush();
        } finally {
            this.#closed = true;
            this.#opened = false;
            this.#buffer = [];
        }

        return result;
    }

    /*
     * =============================================
     * Normalization
     * =============================================
     */

    normalize(item) {
        if (!item) {
            return null;
        }

        if (
            typeof item.toJSON === 'function'
        ) {
            return item.toJSON();
        }

        return item;
    }

    #normalizeSource(source) {
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

    #decorate(
        transaction,
        source
    ) {
        const normalized =
            this.normalize(
                transaction
            );

        if (
            !normalized ||
            typeof normalized !== 'object'
        ) {
            return null;
        }

        return {
            ...normalized,

            ingestion: {
                ...(
                    normalized.ingestion &&
                        typeof normalized.ingestion === 'object'
                        ? normalized.ingestion
                        : {}
                ),

                source:
                    this.#normalizeSource(
                        source
                    ),

                ingestedAt:
                    typeof normalized?.ingestion?.ingestedAt === 'string' &&
                        normalized.ingestion.ingestedAt.trim() !== ''
                        ? normalized.ingestion.ingestedAt.trim()
                        : new Date().toISOString()
            }
        };
    }

    /*
     * =============================================
     * Append
     * =============================================
     *
     * Existing pipeline compatibility:
     *
     * append()
     *   -> buffer
     *   -> auto flush when full
     *
     * Caller can disable auto flush with:
     *
     * new TransactionWriter(..., {
     *     autoFlush: false
     * })
     */

    async append(
        transaction
    ) {
        this.assertOpen();

        const source =
            transaction?.ingestion?.source ||
            this.source;

        const normalized =
            this.#decorate(
                transaction,
                source
            );

        if (!normalized) {
            this.#stats.ignored++;

            return {
                accepted: false,
                buffered: false,
                persisted: false,
                duplicate: false,
                flushed: false,
                reason:
                    'invalid-transaction'
            };
        }

        this.#buffer.push(
            normalized
        );

        this.#stats.appended++;

        if (
            this.autoFlush &&
            this.#buffer.length >=
            this.#bufferSize
        ) {
            const flushResult =
                await this.flush();

            const signature =
                this.#extractSignature(
                    normalized
                );

            const persisted =
                Boolean(
                    flushResult?.success &&
                    signature &&
                    flushResult.signatures.includes(
                        signature
                    )
                );

            return {
                accepted: true,
                buffered: !persisted,
                persisted,
                duplicate:
                    persisted &&
                    flushResult.inserted === 0 &&
                    flushResult.duplicates > 0,

                flushed: true,

                signature,

                flushResult
            };
        }

        return {
            accepted: true,
            buffered: true,
            persisted: false,
            duplicate: false,
            flushed: false,
            signature:
                this.#extractSignature(
                    normalized
                )
        };
    }

    async appendMany(
        transactions
    ) {
        this.assertOpen();

        if (
            !Array.isArray(
                transactions
            )
        ) {
            throw new TypeError(
                'transactions must be an array.'
            );
        }

        const results = [];

        for (
            const transaction
            of transactions
        ) {
            results.push(
                await this.append(
                    transaction
                )
            );
        }

        return {
            received:
                transactions.length,

            results
        };
    }

    /*
     * =============================================
     * Guaranteed persistence path
     * =============================================
     *
     * This is useful when a caller truly needs:
     *
     * await writer.appendPersisted(tx)
     *
     * to mean "SQLite persistence has completed".
     */

    async appendPersisted(
        transaction
    ) {
        this.assertOpen();

        const source =
            transaction?.ingestion?.source ||
            this.source;

        const normalized =
            this.#decorate(
                transaction,
                source
            );

        if (!normalized) {
            this.#stats.ignored++;

            return {
                accepted: false,
                persisted: false,
                duplicate: false,
                signature: null,
                reason:
                    'invalid-transaction'
            };
        }

        /*
         * Preserve write ordering:
         *
         * buffered historical/realtime records
         * must be persisted before the direct item.
         */
        if (
            this.#buffer.length > 0
        ) {
            await this.flush();
        }

        const result =
            await this.#persistBatch(
                [normalized]
            );

        const signature =
            this.#extractSignature(
                normalized
            );

        const duplicate =
            result.inserted === 0 &&
            result.duplicates > 0 &&
            result.invalid === 0;

        return {
            accepted: true,

            persisted:
                result.success,

            duplicate,

            signature,

            inserted:
                result.inserted,

            duplicates:
                result.duplicates,

            invalid:
                result.invalid,

            buyerReceived:
                result.buyerReceived,

            buyerInserted:
                result.buyerInserted,

            buyerDuplicates:
                result.buyerDuplicates,

            buyerInvalid:
                result.buyerInvalid,

            reason:
                result.success
                    ? (
                        duplicate
                            ? 'already-persisted'
                            : 'persisted'
                    )
                    : 'persistence-failed'
        };
    }

    /*
     * =============================================
     * Flush
     * =============================================
     */

    async flush() {
        this.assertOpen();

        if (
            this.#flushPromise
        ) {
            return this.#flushPromise;
        }

        if (
            this.#buffer.length === 0
        ) {
            return this.#emptyFlushResult();
        }

        this.#stats.flushRequested++;

        const incomingBatch =
            [
                ...this.#buffer
            ];

        this.#buffer = [];

        this.#flushPromise =
            (async () => {
                try {
                    const result =
                        await this.#persistBatch(
                            incomingBatch
                        );

                    this.#stats.flushCompleted++;

                    return result;
                } catch (error) {
                    /*
                     * Never lose buffered transactions
                     * because a DB write failed.
                     */
                    this.#buffer = [
                        ...incomingBatch,
                        ...this.#buffer
                    ];

                    this.#stats.persistenceFailures++;

                    throw error;
                } finally {
                    this.#flushPromise = null;
                }
            })();

        return this.#flushPromise;
    }

    #emptyFlushResult() {
        return {
            success: true,
            flushed: false,

            received: 0,
            inserted: 0,
            duplicates: 0,
            invalid: 0,

            buyerReceived: 0,
            buyerInserted: 0,
            buyerDuplicates: 0,
            buyerInvalid: 0,

            persisted: 0,
            failed: 0,

            signatures: []
        };
    }

    /*
     * =============================================
     * Core persistence orchestration
     * =============================================
     */

    async #persistBatch(
        incomingBatch
    ) {
        if (
            !Array.isArray(
                incomingBatch
            ) ||
            incomingBatch.length === 0
        ) {
            return this.#emptyFlushResult();
        }

        const normalizedBatch =
            incomingBatch
                .map(
                    item =>
                        this.normalize(
                            item
                        )
                )
                .filter(Boolean);

        this.#stats.received +=
            normalizedBatch.length;

        /*
         * -----------------------------------------
         * Buyer detection BEFORE atomic DB write.
         * -----------------------------------------
         */

        let buyers = [];

        if (
            this.#buyerDetector &&
            normalizedBatch.length > 0
        ) {
            buyers =
                this.#buyerDetector.detectBuyers(
                    normalizedBatch.map(
                        item =>
                            item?.raw ||
                            item
                    )
                );

            if (!Array.isArray(buyers)) {
                buyers = [];
            }
        }

        this.#stats.buyerReceived +=
            buyers.length;

        /*
         * -----------------------------------------
         * Preferred atomic path.
         * -----------------------------------------
         */

        if (
            typeof this.#db
                .persistRawTransactionsAndBuyersBatch ===
            'function'
        ) {
            const atomicResult =
                this.#db.persistRawTransactionsAndBuyersBatch(
                    normalizedBatch,
                    buyers
                );

            const raw =
                atomicResult?.raw || {};

            const buyer =
                atomicResult?.buyers || {};

            const received =
                Number(
                    raw.received
                ) || 0;

            const inserted =
                Number(
                    raw.inserted
                ) || 0;

            const duplicates =
                Number(
                    raw.duplicates
                ) || 0;

            const invalid =
                Number(
                    raw.invalid
                ) || 0;

            const buyerReceived =
                Number(
                    buyer.received
                ) || 0;

            const buyerInserted =
                Number(
                    buyer.inserted
                ) || 0;

            const buyerDuplicates =
                Number(
                    buyer.duplicates
                ) || 0;

            const buyerInvalid =
                Number(
                    buyer.invalid
                ) || 0;

            const rawComplete =
                inserted +
                duplicates ===
                received -
                invalid;

            const buyersComplete =
                buyerInserted +
                buyerDuplicates ===
                buyerReceived -
                buyerInvalid;

            const success =
                rawComplete &&
                buyersComplete;

            if (success) {
                this.#stats.persisted +=
                    inserted +
                    duplicates;
            }

            this.#stats.inserted +=
                inserted;

            this.#stats.duplicates +=
                duplicates;

            this.#stats.invalid +=
                invalid;

            this.#stats.buyerInserted +=
                buyerInserted;

            this.#stats.buyerDuplicates +=
                buyerDuplicates;

            this.#stats.buyerInvalid +=
                buyerInvalid;

            return {
                success,

                flushed: true,

                received,

                inserted,

                duplicates,

                invalid,

                buyerReceived,

                buyerInserted,

                buyerDuplicates,

                buyerInvalid,

                persisted:
                    inserted +
                    duplicates,

                failed:
                    success
                        ? 0
                        : 1,

                signatures:
                    Array.isArray(
                        raw.signatures
                    )
                        ? raw.signatures
                        : []
            };
        }

        /*
         * -----------------------------------------
         * Backward-compatible fallback.
         * -----------------------------------------
         *
         * This path is kept so Writer remains
         * usable with older DB implementations.
         */

        let rawResult;

        try {
            rawResult =
                this.#db.insertRawTransactionsBatch(
                    normalizedBatch
                );
        } catch {
            this.#stats.persistenceFailures++;
            throw new Error(
                'Raw transaction persistence failed.'
            );
        }

        const received =
            Number(
                rawResult?.received
            ) || 0;

        const inserted =
            Number(
                rawResult?.inserted
            ) || 0;

        const duplicates =
            Number(
                rawResult?.duplicates
            ) || 0;

        const invalid =
            Number(
                rawResult?.invalid
            ) || 0;

        this.#stats.inserted +=
            inserted;

        this.#stats.duplicates +=
            duplicates;

        this.#stats.invalid +=
            invalid;

        let buyerInserted = 0;
        let buyerDuplicates = 0;
        let buyerInvalid = 0;

        if (
            buyers.length > 0
        ) {
            let buyerResult;

            try {
                buyerResult =
                    this.#db.insertBuyersBatch(
                        buyers
                    );
            } catch (error) {
                this.#stats.persistenceFailures++;

                return {
                    success: false,
                    flushed: true,

                    received,
                    inserted,
                    duplicates,
                    invalid,

                    buyerReceived:
                        buyers.length,

                    buyerInserted: 0,
                    buyerDuplicates: 0,
                    buyerInvalid: buyers.length,

                    persisted:
                        inserted +
                        duplicates,

                    failed: 1,

                    signatures:
                        Array.isArray(
                            rawResult?.signatures
                        )
                            ? rawResult.signatures
                            : []
                };
            }

            buyerInserted =
                Number(
                    buyerResult?.inserted
                ) || 0;

            buyerDuplicates =
                Number(
                    buyerResult?.duplicates
                ) || 0;

            buyerInvalid =
                Number(
                    buyerResult?.invalid
                ) || 0;
        }

        this.#stats.buyerInserted +=
            buyerInserted;

        this.#stats.buyerDuplicates +=
            buyerDuplicates;

        this.#stats.buyerInvalid +=
            buyerInvalid;

        const rawComplete =
            inserted +
            duplicates ===
            received -
            invalid;

        const buyersComplete =
            buyerInserted +
            buyerDuplicates ===
            buyers.length -
            buyerInvalid;

        const success =
            rawComplete &&
            buyersComplete;

        if (success) {
            this.#stats.persisted +=
                inserted +
                duplicates;
        }

        return {
            success,

            flushed: true,

            received,
            inserted,
            duplicates,
            invalid,

            buyerReceived:
                buyers.length,

            buyerInserted,
            buyerDuplicates,
            buyerInvalid,

            persisted:
                inserted +
                duplicates,

            failed:
                success
                    ? 0
                    : 1,

            signatures:
                Array.isArray(
                    rawResult?.signatures
                )
                    ? rawResult.signatures
                    : []
        };
    }

    /*
     * =============================================
     * Signature helper
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

        const direct =
            transaction.signature;

        if (
            typeof direct === 'string' &&
            direct.trim() !== ''
        ) {
            return direct.trim();
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
     * Introspection
     * =============================================
     */

    bufferSize() {
        return this.#buffer.length;
    }

    configuredBufferSize() {
        return this.#bufferSize;
    }

    stats() {
        return {
            ...this.#stats,

            bufferSize:
                this.#buffer.length,

            configuredBufferSize:
                this.#bufferSize,

            opened:
                this.#opened,

            closed:
                this.#closed,

            autoFlush:
                this.autoFlush
        };
    }

    resetStats() {
        for (
            const key of Object.keys(
                this.#stats
            )
        ) {
            this.#stats[key] = 0;
        }
    }
}

module.exports =
    TransactionWriter;