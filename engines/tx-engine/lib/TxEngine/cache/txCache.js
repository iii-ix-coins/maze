'use strict';

const DEFAULT_MAX_ENTRIES = 50_000;

class TxCache {
    constructor(maxEntries = DEFAULT_MAX_ENTRIES) {
        const parsed = Number(maxEntries);
        this.maxEntries = Number.isSafeInteger(parsed) && parsed > 0
            ? parsed
            : DEFAULT_MAX_ENTRIES;
        // Map preserves insertion order, allowing cheap LRU-style eviction.
        this.cache = new Map();
    }

    has(signature) {
        return this.get(signature) !== undefined;
    }

    get(signature) {
        if (typeof signature !== 'string') return undefined;
        const key = signature.trim();
        if (!key || !this.cache.has(key)) return undefined;
        const value = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }

    add(signature, value = true) {
        if (typeof signature !== 'string' || signature.trim() === '') {
            throw new TypeError('Signature must be a non-empty string.');
        }
        const key = signature.trim();
        if (this.cache.has(key)) this.cache.delete(key);
        this.cache.set(key, value);
        while (this.cache.size > this.maxEntries) {
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey === undefined) break;
            this.cache.delete(oldestKey);
        }
        return key;
    }

    remove(signature) {
        if (typeof signature !== 'string') return false;
        return this.cache.delete(signature.trim());
    }

    clear() {
        this.cache.clear();
    }

    size() {
        return this.cache.size;
    }

    values() {
        return [...this.cache.keys()];
    }
}

module.exports = TxCache;
