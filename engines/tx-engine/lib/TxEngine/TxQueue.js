'use strict';

class TxQueue {
    constructor({ concurrency = 5 } = {}) {
        if (!Number.isInteger(concurrency) || concurrency < 1) {
            throw new TypeError('concurrency must be a positive integer.');
        }
        this.concurrency = concurrency;
        this.queue = [];
        this.running = 0;
        this.idleWaiters = new Set();
    }

    add(task) {
        if (typeof task !== 'function') {
            throw new TypeError('task must be a function.');
        }
        return new Promise((resolve, reject) => {
            this.queue.push({ task, resolve, reject });
            this.#next();
        });
    }

    // Run a collection of task factories with bounded concurrency while
    // preserving input order in the returned results.
    run(tasks) {
        if (!Array.isArray(tasks)) {
            throw new TypeError('tasks must be an array.');
        }
        return Promise.all(tasks.map(task => this.add(task)));
    }

    async onIdle() {
        if (this.idle()) return;
        await new Promise(resolve => this.idleWaiters.add(resolve));
    }

    // Reject queued work rather than silently leaving callers' promises pending.
    clear(reason = new Error('Transaction queue cleared.')) {
        const pending = this.queue.splice(0);
        for (const item of pending) item.reject(reason);
        this.#notifyIdle();
        return pending.length;
    }

    size() { return this.queue.length; }
    active() { return this.running; }
    idle() { return this.running === 0 && this.queue.length === 0; }

    #notifyIdle() {
        if (!this.idle()) return;
        for (const resolve of this.idleWaiters) resolve();
        this.idleWaiters.clear();
    }

    #next() {
        while (this.running < this.concurrency && this.queue.length > 0) {
            const item = this.queue.shift();
            this.running++;
            Promise.resolve()
                .then(item.task)
                .then(item.resolve, item.reject)
                .finally(() => {
                    this.running--;
                    this.#next();
                    this.#notifyIdle();
                });
        }
        this.#notifyIdle();
    }
}

module.exports = TxQueue;
