'use strict';

const {
    classifyWallets,
    CLASSIFICATION_CACHE_VERSION
} = require('./walletClassifier');
const { sleep, throwIfAborted } = require('./utils');

class ClassificationService {
    constructor({ runtimeConfig, db, signal, onProgress, onUpdated } = {}) {
        if (!runtimeConfig) throw new TypeError('runtimeConfig is required.');
        if (!db) throw new TypeError('db is required.');

        this.runtimeConfig = runtimeConfig;
        this.db = db;
        this.signal = signal || null;
        this.onProgress = typeof onProgress === 'function' ? onProgress : null;
        this.onUpdated = typeof onUpdated === 'function' ? onUpdated : null;
        this.running = false;
        this.wakeResolver = null;
        this.workerPromise = null;
        this.lastError = null;
    }

    wake(reason = 'external') {
        this.lastWakeReason = reason;
        if (this.wakeResolver) {
            const resolve = this.wakeResolver;
            this.wakeResolver = null;
            resolve();
        }
    }

    async waitForWakeOrInterval(ms) {
        if (this.signal?.aborted) return;

        let wakeResolve = null;
        const wakePromise = new Promise(resolve => {
            wakeResolve = resolve;
            this.wakeResolver = resolve;
        });

        try {
            await Promise.race([
                sleep(ms, this.signal),
                wakePromise
            ]);
        } finally {
            if (this.wakeResolver === wakeResolve) {
                this.wakeResolver = null;
            }
        }
    }

    async start() {
        if (this.running) return this.workerPromise;
        this.running = true;

        this.db.recoverClassificationLeases(
            Date.now(),
            Number(this.runtimeConfig.classificationLeaseMs || 300_000)
        );

        this.workerPromise = this._loop();
        return this.workerPromise;
    }

    async _loop() {
        console.log('[Holder Engine] [Classification] Background service started.');

        while (!this.signal?.aborted) {
            try {
                const work = this.db.claimClassificationCandidates({
                    nowMs: Date.now(),
                    limit: Number(this.runtimeConfig.classificationWorkBatchSize || 600),
                    normalTtlMs: Number(this.runtimeConfig.classificationCacheTtlMs || 21_600_000),
                    unknownTtlMs: Number(this.runtimeConfig.classificationUnknownTtlMs || 120_000),
                    classificationVersion: CLASSIFICATION_CACHE_VERSION,
                    leaseMs: Number(this.runtimeConfig.classificationLeaseMs || 300_000)
                });

                if (work.length === 0) {
                    await this.waitForWakeOrInterval(
                        Number(this.runtimeConfig.classificationLoopIntervalMs || 1000)
                    );
                    continue;
                }

                await this._processWork(work);
            } catch (error) {
                if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') {
                    break;
                }

                this.lastError = error;
                console.error(
                    '[Holder Engine] [Classification] Background worker error:',
                    error?.message || error
                );

                await this.waitForWakeOrInterval(
                    Number(this.runtimeConfig.classificationRetryDelayMs || 15_000)
                );
            }
        }

        this.running = false;
        console.log('[Holder Engine] [Classification] Background service stopped.');
    }

    async _processWork(work) {
        throwIfAborted(this.signal);

        const wallets = work.map(item => item.wallet);
        const queueReasonByWallet = new Map(
            work.map(item => [item.wallet, item.reason])
        );

        if (this.onProgress) {
            await this.onProgress({
                phase: 'classification',
                state: 'started',
                wallets: wallets.length
            });
        }

        let result;

        try {
            result = await classifyWallets(
                wallets,
                this.runtimeConfig,
                new Map(),
                {
                    signal: this.signal,
                    onProgress: this.onProgress
                }
            );
        } catch (error) {
            this.db.failClassificationJobs(
                wallets,
                error?.message || String(error),
                Date.now() + Number(this.runtimeConfig.classificationRetryDelayMs || 15_000)
            );
            throw error;
        }

        throwIfAborted(this.signal);

        const updates = wallets.map(wallet => ({
            wallet,
            state: result.states.get(wallet) || 'unknown',
            classificationUpdatedMs:
                result.classificationUpdatedMs.get(wallet) || Date.now(),
            reason: queueReasonByWallet.get(wallet) || 'background-refresh'
        }));

        const updatedCount = this.db.applyClassificationResults(updates, {
            classificationVersion:
                result.metrics.classificationCacheVersion,
            checkedAtMs: Date.now()
        });

        this.lastError = null;

        if (this.onUpdated) {
            await this.onUpdated({
                updatedCount,
                metrics: result.metrics
            });
        }

        if (this.onProgress) {
            await this.onProgress({
                phase: 'classification',
                state: 'completed',
                wallets: wallets.length,
                updatedCount,
                metrics: result.metrics
            });
        }
    }

    async stop() {
        this.wake('shutdown');
        if (this.workerPromise) {
            try {
                await this.workerPromise;
            } catch {
                // Loop errors are already logged by the worker.
            }
        }
    }
}

module.exports = ClassificationService;
