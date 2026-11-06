'use strict';

const Transaction = require('../models/Transaction');

class TransactionScanner {
    #txEngine;
    #enhanced;
    #batchSize;
    #batchConcurrency;

    constructor({
        txEngine,
        enhanced = true,
        batchSize = 25,
        batchConcurrency = 1
    } = {}) {
        if (!txEngine) throw new Error('txEngine is required.');
        if (typeof enhanced !== 'boolean') throw new TypeError('enhanced must be a boolean.');
        if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
            throw new RangeError('batchSize must be an integer between 1 and 100.');
        }
        if (!Number.isInteger(batchConcurrency) || batchConcurrency < 1 || batchConcurrency > 20) {
            throw new RangeError('batchConcurrency must be an integer between 1 and 20.');
        }

        this.#txEngine = txEngine;
        this.#enhanced = enhanced;
        this.#batchSize = batchSize;
        this.#batchConcurrency = batchConcurrency;
    }

    async *scan(signatures) {
        if (!signatures || (
            typeof signatures[Symbol.asyncIterator] !== 'function' &&
            typeof signatures[Symbol.iterator] !== 'function'
        )) {
            throw new TypeError('signatures must be an Iterable or AsyncIterable.');
        }

        const pending = [];
        let buffer = [];
        let normalEnd = false;
        let batchNumber = 0;

        const enqueueBatch = batch => {
            const startedAt = Date.now();
            const entry = {
                batchId: batchNumber + 1,
                signatures: [...batch],
                startedAt,
                promise: Promise.resolve()
                    .then(() => this.#fetchBatch(batch))
                    .then(transactions => ({ ok: true, transactions, elapsedMs: Date.now() - startedAt }))
                    .catch(error => ({ ok: false, error, elapsedMs: Date.now() - startedAt }))
            };
            pending.push(entry);
            batchNumber += 1;
        };

        const drainOldestBatch = async () => {
            const entry = pending.shift();
            if (!entry) return [];

            const outcome = await entry.promise;
            if (!outcome.ok) {
                console.error(
                    `[txScanner] Batch ${entry.batchId} failed after ${outcome.elapsedMs}ms (${entry.signatures.length} signatures):`,
                    outcome.error?.message || outcome.error
                );
                throw outcome.error;
            }

            if (!Array.isArray(outcome.transactions) || outcome.transactions.length !== entry.signatures.length) {
                throw new Error(
                    `Batch result count mismatch: requested ${entry.signatures.length}, received ${Array.isArray(outcome.transactions) ? outcome.transactions.length : 'non-array'}.`
                );
            }

            const parsed = [];
            for (let i = 0; i < outcome.transactions.length; i += 1) {
                const raw = outcome.transactions[i];
                if (!raw) {
                    throw new Error(`Missing transaction result for signature ${entry.signatures[i]}; refusing to advance scan cursor.`);
                }

                let transaction;
                try {
                    transaction = Transaction.fromRpc(raw);
                } catch (error) {
                    throw new Error(
                        `Transaction conversion failed for ${entry.signatures[i]}: ${error?.message || error}`
                    );
                }

                if (transaction.signature !== entry.signatures[i]) {
                    throw new Error(
                        `Transaction/signature order mismatch at batch index ${i}; expected ${entry.signatures[i]}, received ${transaction.signature}.`
                    );
                }
                parsed.push(transaction);
            }

            console.log(
                `[txScanner] Batch completed: ${entry.signatures.length} transactions in ${outcome.elapsedMs}ms.`
            );
            return parsed;
        };

        try {
            for await (const signatureItem of signatures) {
                const sig = typeof signatureItem === 'string'
                    ? signatureItem
                    : signatureItem?.signature;
                if (typeof sig === 'string' && sig.trim() !== '') buffer.push(sig.trim());

                if (buffer.length >= this.#batchSize) {
                    enqueueBatch(buffer);
                    buffer = [];

                    // Maintain bounded parallelism and emit in signature order.
                    if (pending.length >= this.#batchConcurrency) {
                        const parsed = await drainOldestBatch();
                        for (const transaction of parsed) yield transaction;
                    }
                }
            }

            if (buffer.length > 0) {
                enqueueBatch(buffer);
                buffer = [];
            }

            while (pending.length > 0) {
                const parsed = await drainOldestBatch();
                for (const transaction of parsed) yield transaction;
            }

            normalEnd = true;
        } finally {
            // A later parallel batch may have completed (and populated cache)
            // even if an earlier batch failed. Drain all pending requests and
            // clear cache on an interrupted scan, so the next run can safely retry.
            if (pending.length > 0) {
                await Promise.allSettled(pending.map(entry => entry.promise));
                pending.length = 0;
            }
            if (!normalEnd) this.#txEngine.clearCache?.();
        }
    }

    async #fetchBatch(signatures) {
        if (this.#enhanced) return this.#txEngine.fetchEnhancedTransactions(signatures);
        return this.#txEngine.fetchTransactions(signatures);
    }
}

module.exports = TransactionScanner;
