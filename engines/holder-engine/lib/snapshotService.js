'use strict';

const { takeSnapshot } = require('./snapshot');
const { throwIfAborted } = require('./utils');

/**
 * SnapshotService owns only chain acquisition and snapshot publication.
 * Classification and Ranking are signalled after the snapshot is durable,
 * but neither is awaited here.
 */
class SnapshotService {
    constructor({ runtimeConfig, db, signal, onProgress, onCommitted } = {}) {
        if (!runtimeConfig) throw new TypeError('runtimeConfig is required.');
        if (!db) throw new TypeError('db is required.');

        this.runtimeConfig = runtimeConfig;
        this.db = db;
        this.signal = signal || null;
        this.onProgress = typeof onProgress === 'function' ? onProgress : null;
        this.onCommitted = typeof onCommitted === 'function' ? onCommitted : null;
    }

    async runOnce() {
        throwIfAborted(this.signal);
        const startedAt = Date.now();

        const snapshot = await takeSnapshot(this.runtimeConfig, {
            signal: this.signal,
            onProgress: this.onProgress
        });

        throwIfAborted(this.signal);

        const timestampMs = this.db.publishHolderSnapshot(snapshot);

        const result = {
            timestampMs,
            startedAtMs: startedAt,
            generatedAt: snapshot.meta.generatedAt,
            durationMs: Date.now() - startedAt,
            holderCount: snapshot.holderCount,
            tokenAccounts: snapshot.meta.discoveredTokenAccounts,
            processedTokenAccounts: snapshot.meta.processedTokenAccounts,
            strategy: snapshot.meta.scanStrategy,
            pages: snapshot.meta.scanPages
        };

        if (this.onCommitted) {
            await this.onCommitted(result, snapshot);
        }

        return { ...result, snapshot };
    }
}

module.exports = SnapshotService;
