'use strict';

const { sleep, throwIfAborted } = require('./utils');

class RankingService {
    constructor({ runtimeConfig, db, signal, onRebuilt } = {}) {
        if (!runtimeConfig) throw new TypeError('runtimeConfig is required.');
        if (!db) throw new TypeError('db is required.');

        this.runtimeConfig = runtimeConfig;
        this.db = db;
        this.signal = signal || null;
        this.onRebuilt = typeof onRebuilt === 'function' ? onRebuilt : null;
        this.running = false;
        this.dirty = false;
        this.reason = null;
        this.timer = null;
        this.wakeResolver = null;
        this.workerPromise = null;
        this.lastRebuildAtMs = 0;
    }

    requestRebuild(reason = 'external') {
        this.dirty = true;
        this.reason = reason;
        if (this.wakeResolver) {
            const resolve = this.wakeResolver;
            this.wakeResolver = null;
            resolve();
        }
    }

    async start() {
        if (this.running) return this.workerPromise;
        this.running = true;
        this.requestRebuild('startup');
        this.workerPromise = this._loop();
        return this.workerPromise;
    }

    async _waitForSignal() {
        if (this.signal?.aborted) return;
        await new Promise(resolve => {
            this.wakeResolver = resolve;
            this.timer = setTimeout(() => {
                if (this.wakeResolver === resolve) this.wakeResolver = null;
                resolve();
            }, 60_000);
        });
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    async _loop() {
        console.log('[Holder Engine] [Ranking] Background service started.');

        while (!this.signal?.aborted) {
            if (!this.dirty) {
                await this._waitForSignal();
            }
            if (this.signal?.aborted) break;
            if (!this.dirty) continue;

            const debounce = Number(this.runtimeConfig.rankingRebuildDebounceMs || 0);
            if (debounce > 0) {
                await sleep(debounce, this.signal);
            }

            if (!this.dirty || this.signal?.aborted) continue;

            const minInterval = Number(this.runtimeConfig.rankingMinRebuildIntervalMs || 0);
            const elapsed = Date.now() - this.lastRebuildAtMs;
            if (elapsed < minInterval) {
                await sleep(minInterval - elapsed, this.signal);
            }

            if (this.signal?.aborted) break;

            const reason = this.reason || 'dirty';
            this.dirty = false;
            this.reason = null;

            try {
                throwIfAborted(this.signal);
                const latest = this.db.getLatestSnapshotTimestamp();
                if (!latest) continue;

                const metrics = this.db.rebuildRankingsAndTop100(latest);
                this.lastRebuildAtMs = Date.now();

                console.log(
                    `[Holder Engine] [Ranking] Rebuilt. ` +
                    `eligibleUsers=${metrics.eligibleUsers} ` +
                    `top100=${metrics.top100Count} ` +
                    `unknown=${metrics.unknownCount} ` +
                    `reason=${reason}`
                );

                if (this.onRebuilt) {
                    await this.onRebuilt(metrics);
                }
            } catch (error) {
                if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') {
                    break;
                }

                console.error(
                    '[Holder Engine] [Ranking] Rebuild failed:',
                    error?.message || error
                );
                this.dirty = true;
                this.reason = 'retry-after-error';
                await sleep(2000, this.signal);
            }
        }

        this.running = false;
        console.log('[Holder Engine] [Ranking] Background service stopped.');
    }

    async stop() {
        this.requestRebuild('shutdown');
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        if (this.wakeResolver) {
            const resolve = this.wakeResolver;
            this.wakeResolver = null;
            resolve();
        }
        if (this.workerPromise) {
            try {
                await this.workerPromise;
            } catch {
                // Already logged.
            }
        }
    }
}

module.exports = RankingService;
