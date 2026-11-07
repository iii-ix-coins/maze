'use strict';

const TxQueue = require('./TxQueue');
const TxCache = require('./cache/txCache');
const HeliusProvider = require('./providers/helius');

class TxEngine {
    constructor(options = {}) {
        this.provider = new HeliusProvider({
            apiKeys: options.apiKeys,
            timeout: options.timeout,
            retries: options.retries,
            retryDelay: options.retryDelay,
            mode: options.mode,
            commitment: options.commitment
        });

        this.queue = new TxQueue({
            concurrency: options.concurrency ?? 8
        });

        this.cache = new TxCache(options.cacheMaxEntries);

        // Prevent duplicate in-flight HTTP requests for the same signature.
        // A signature is added to the permanent cache only after a successful
        // fetch. This keeps temporary failures retryable.
        this.inFlight = new Map();
    }

    #extractSig(signature) {
        const value = typeof signature === 'string'
            ? signature
            : signature?.signature;
        return typeof value === 'string' && value.trim() !== ''
            ? value.trim()
            : null;
    }

    #extractTransactionSig(transaction) {
        const signature =
            transaction?.transaction?.signatures?.[0] ??
            transaction?.signatures?.[0] ??
            transaction?.signature;

        return typeof signature === 'string'
            ? signature
            : null;
    }

    #cacheSuccessfulTransactions(
        transactions,
        requestedSignatures
    ) {
        if (!Array.isArray(transactions)) {
            return;
        }

        const requested = new Set(
            requestedSignatures
        );

        for (const transaction of transactions) {
            const signature =
                this.#extractTransactionSig(
                    transaction
                );

            if (
                signature &&
                requested.has(signature)
            ) {
                this.cache.add(signature, transaction);
            }
        }
    }

    async #fetchSingle(
        signature,
        fetcher
    ) {
        const cached = this.cache.get(signature);
        if (cached !== undefined) {
            return cached;
        }

        const existing =
            this.inFlight.get(signature);

        if (existing) {
            return existing;
        }

        const promise = (async () => {
            const transaction =
                await fetcher();

            // IMPORTANT:
            // Do not poison the permanent cache when the request fails
            // or when the provider returns null.
            if (transaction) {
                const returnedSignature =
                    this.#extractTransactionSig(transaction);
                // A provider/proxy response must not mark an unrelated signature
                // as fetched. Some RPC shapes omit the signature; in that case
                // leave it uncached so a later request can verify it.
                if (returnedSignature === signature) {
                    this.cache.add(signature, transaction);
                }
            }

            return transaction;
        })().finally(() => {
            this.inFlight.delete(signature);
        });

        this.inFlight.set(
            signature,
            promise
        );

        return promise;
    }

    has(signature) {
        const sig =
            this.#extractSig(signature);

        return sig
            ? this.cache.has(sig)
            : false;
    }

    clearCache() {
        this.cache.clear();
    }

    cacheSize() {
        return this.cache.size();
    }

    inFlightSize() {
        return this.inFlight.size;
    }

    async fetchEnhancedTransaction(
        signature
    ) {
        const sig =
            this.#extractSig(signature);

        if (!sig) {
            return null;
        }

        return this.#fetchSingle(
            sig,
            () =>
                this.provider.getEnhancedTransaction(
                    sig
                )
        );
    }

    async fetchEnhancedTransactions(signatures) {
        if (!Array.isArray(signatures)) {
            throw new TypeError('signatures must be an array.');
        }

        const requested = [];
        const seen = new Set();
        const resultBySignature = new Map();

        for (const item of signatures) {
            const sig = this.#extractSig(item);
            if (!sig || seen.has(sig)) continue;
            seen.add(sig);
            requested.push(sig);

            const cached = this.cache.get(sig);
            if (cached !== undefined) resultBySignature.set(sig, cached);
        }

        const pending = requested.filter(sig => !resultBySignature.has(sig));
        if (pending.length > 0) {
            const transactions = await this.provider.getEnhancedTransactions(pending);
            if (!Array.isArray(transactions)) {
                throw new Error('Helius provider returned an invalid batch result.');
            }

            this.#cacheSuccessfulTransactions(transactions, pending);
            for (const transaction of transactions) {
                const sig = this.#extractTransactionSig(transaction);
                if (sig && pending.includes(sig)) resultBySignature.set(sig, transaction);
            }
        }

        const missing = requested.filter(sig => !resultBySignature.has(sig));
        if (missing.length > 0) {
            throw new Error(`Transaction batch incomplete: ${missing.length} requested transaction(s) are missing.`);
        }

        return requested.map(sig => resultBySignature.get(sig));
    }

    async fetchTransaction(signature) {
        const sig =
            this.#extractSig(signature);

        if (!sig) {
            return null;
        }

        return this.#fetchSingle(
            sig,
            () =>
                this.provider.getTransaction(
                    sig
                )
        );
    }

    async fetchTransactions(signatures) {
        if (!Array.isArray(signatures)) {
            throw new TypeError('signatures must be an array.');
        }

        const requested = [];
        const seen = new Set();
        const resultBySignature = new Map();
        const tasks = [];

        for (const item of signatures) {
            const sig = this.#extractSig(item);
            if (!sig || seen.has(sig)) continue;
            seen.add(sig);
            requested.push(sig);

            const cached = this.cache.get(sig);
            if (cached !== undefined) {
                resultBySignature.set(sig, cached);
                continue;
            }

            tasks.push(async () => [sig, await this.#fetchSingle(
                sig,
                () => this.provider.getTransaction(sig)
            )]);
        }

        const fetched = await this.queue.run(tasks);
        for (const [sig, transaction] of fetched) {
            if (transaction) resultBySignature.set(sig, transaction);
        }

        const missing = requested.filter(sig => !resultBySignature.has(sig));
        if (missing.length > 0) {
            throw new Error(`Transaction batch incomplete: ${missing.length} requested transaction(s) are missing.`);
        }

        return requested.map(sig => resultBySignature.get(sig));
    }

    async fetchSignatures(
        address,
        options = {}
    ) {
        return this.provider.getSignaturesForAddress(
            address,
            options
        );
    }
}

module.exports = TxEngine;
