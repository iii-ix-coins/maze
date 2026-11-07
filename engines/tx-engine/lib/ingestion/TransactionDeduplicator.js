'use strict';
const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 100_000;
const MAX_CLEANUP_BATCH = 5_000;
class TransactionDeduplicator {
    constructor(options = {}) {
        const ttlMs =
            Number(options.ttlMs);
        const maxEntries =
            Number(options.maxEntries);
        this.ttlMs =
            Number.isFinite(ttlMs) && ttlMs > 0
                ? Math.floor(ttlMs)
                : DEFAULT_TTL_MS;
        this.maxEntries =
            Number.isInteger(maxEntries) && maxEntries > 0
                ? maxEntries
                : DEFAULT_MAX_ENTRIES;
        this.committed =
            new Map();
        this.inFlight =
            new Set();
        this.metrics = {
            reserved: 0,
            committed: 0,
            released: 0,
            duplicatesCommitted: 0,
            duplicatesInFlight: 0,
            invalid: 0,
            evicted: 0,
            expired: 0
        };
    }
    normalize(signature) {
        if (
            typeof signature !== 'string'
        ) {
            return null;
        }
        const normalized =
            signature.trim();
        if (
            normalized === ''
        ) {
            return null;
        }
        return normalized;
    }
    has(signature) {
        const normalized =
            this.normalize(signature);
        if (!normalized) {
            return false;
        }
        this.prune();
        return this.committed.has(
            normalized
        );
    }
    isInFlight(signature) {
        const normalized =
            this.normalize(signature);
        if (!normalized) {
            return false;
        }
        return this.inFlight.has(
            normalized
        );
    }
    reserve(signature) {
        const normalized =
            this.normalize(signature);
        if (!normalized) {
            this.metrics.invalid++;
            return {
                accepted: false,
                duplicate: false,
                reason: 'invalid-signature'
            };
        }
        this.prune();
        if (
            this.committed.has(
                normalized
            )
        ) {
            this.metrics.duplicatesCommitted++;
            return {
                accepted: false,
                duplicate: true,
                reason: 'committed',
                signature: normalized
            };
        }
        if (
            this.inFlight.has(
                normalized
            )
        ) {
            this.metrics.duplicatesInFlight++;
            return {
                accepted: false,
                duplicate: true,
                reason: 'in-flight',
                signature: normalized
            };
        }
        this.inFlight.add(
            normalized
        );
        this.metrics.reserved++;
        return {
            accepted: true,
            duplicate: false,
            signature: normalized
        };
    }
    commit(signature) {
        const normalized =
            this.normalize(signature);
        if (!normalized) {
            this.metrics.invalid++;
            return false;
        }
        this.inFlight.delete(
            normalized
        );
        const now =
            Date.now();
        if (
            this.committed.has(
                normalized
            )
        ) {
            this.committed.delete(
                normalized
            );
        }
        this.committed.set(
            normalized,
            now
        );
        this.metrics.committed++;
        this.#enforceMaxEntries();
        return true;
    }
    release(signature) {
        const normalized =
            this.normalize(signature);
        if (!normalized) {
            this.metrics.invalid++;
            return false;
        }
        const removed =
            this.inFlight.delete(
                normalized
            );
        if (removed) {
            this.metrics.released++;
        }
        return removed;
    }
    accept(signature) {
        const reservation =
            this.reserve(signature);
        return reservation.accepted;
    }
    prune() {
        if (
            this.committed.size === 0
        ) {
            return 0;
        }
        const now =
            Date.now();
        const cutoff =
            now - this.ttlMs;
        let removed = 0;
        for (
            const [
                signature,
                committedAt
            ]
            of this.committed
        ) {
            if (
                committedAt > cutoff
            ) {
                break;
            }
            this.committed.delete(
                signature
            );
            this.metrics.expired++;
            removed++;
            if (
                removed >= MAX_CLEANUP_BATCH
            ) {
                break;
            }
        }
        return removed;
    }
    #enforceMaxEntries() {
        while (
            this.committed.size >
            this.maxEntries
        ) {
            const oldest =
                this.committed
                    .keys()
                    .next();
            if (
                oldest.done
            ) {
                break;
            }
            this.committed.delete(
                oldest.value
            );
            this.metrics.evicted++;
        }
    }
    clear() {
        this.committed.clear();
        this.inFlight.clear();
    }
    size() {
        this.prune();
        return this.committed.size;
    }
    inFlightSize() {
        return this.inFlight.size;
    }
    stats() {
        this.prune();
        return {
            committed:
                this.committed.size,
            inFlight:
                this.inFlight.size,
            ttlMs:
                this.ttlMs,
            maxEntries:
                this.maxEntries,

            ...this.metrics
        };
    }
}
module.exports =
    TransactionDeduplicator;