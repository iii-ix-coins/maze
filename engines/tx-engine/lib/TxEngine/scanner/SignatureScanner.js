'use strict';

const Signature = require('../models/Signature');

class SignatureScanner {
    #txEngine;
    #history;

    constructor({ txEngine, history }) {
        if (!txEngine) throw new Error('txEngine is required.');
        if (!history || typeof history.has !== 'function' || typeof history.add !== 'function') {
            throw new TypeError('Invalid TransactionHistory instance.');
        }
        this.#txEngine = txEngine;
        this.#history = history;
    }

    async *scan({
        wallet,
        before = undefined,
        until = undefined,
        limit = 100,
        status = null
    }) {
        if (typeof wallet !== 'string' || wallet.trim() === '') {
            throw new TypeError('Invalid wallet.');
        }

        const totalLimit = Number(limit);
        if (!Number.isSafeInteger(totalLimit) || totalLimit < 1) {
            throw new RangeError('limit must be a positive safe integer.');
        }

        const scanStatus = status && typeof status === 'object' ? status : {};
        Object.assign(scanStatus, {
            caughtUp: false,
            limitReached: false,
            stoppedBy: 'running',
            pages: 0,
            yielded: 0,
            newestSignature: null,
            oldestSignature: null,
            startBefore: before || null,
            untilSignature: until || null
        });

        let cursor = before;
        let yielded = 0;

        while (yielded < totalLimit) {
            const remaining = totalLimit - yielded;
            const pageLimit = Math.min(remaining, 1000);
            const previousCursor = cursor || null;
            const page = await this.#fetchPage({
                wallet,
                before: cursor,
                until,
                limit: pageLimit
            });

            if (!Array.isArray(page) || page.length === 0) {
                scanStatus.caughtUp = true;
                scanStatus.stoppedBy = 'empty-page';
                break;
            }

            scanStatus.pages += 1;
            let reachedBoundary = false;
            const inPage = new Set();

            for (const raw of page) {
                if (!raw || typeof raw.signature !== 'string' || raw.signature.trim() === '') {
                    continue;
                }

                const sig = raw.signature.trim();
                if (until && sig === until) {
                    reachedBoundary = true;
                    break;
                }
                if (inPage.has(sig) || this.#history.has(sig)) {
                    continue;
                }
                inPage.add(sig);
                this.#history.add(sig);

                const signature = Signature.fromRpc(raw);
                yielded += 1;
                scanStatus.yielded = yielded;
                if (!scanStatus.newestSignature) scanStatus.newestSignature = signature.signature;
                scanStatus.oldestSignature = signature.signature;
                yield signature;

                if (yielded >= totalLimit) {
                    scanStatus.limitReached = true;
                    scanStatus.stoppedBy = 'limit';
                    break;
                }
            }

            if (reachedBoundary) {
                scanStatus.caughtUp = true;
                scanStatus.stoppedBy = 'boundary';
                break;
            }

            const nextCursor = page[page.length - 1]?.signature;
            if (!nextCursor || nextCursor === previousCursor) {
                throw new Error('Signature pagination did not advance; refusing to checkpoint an unsafe cursor.');
            }
            cursor = nextCursor;

            if (yielded >= totalLimit) {
                // The run budget was exhausted. Resume from the persisted
                // continuation cursor on the next run instead of skipping backlog.
                scanStatus.limitReached = true;
                scanStatus.stoppedBy = 'limit';
                break;
            }

            if (page.length < pageLimit) {
                scanStatus.caughtUp = true;
                scanStatus.stoppedBy = 'short-page';
                break;
            }
        }

        if (yielded > 0) {
            console.log(`[Tx Engine] Signature scan yielded ${yielded} signatures (pages=${scanStatus.pages}, caughtUp=${scanStatus.caughtUp}).`);
        }
    }

    async #fetchPage({ wallet, before, until, limit }) {
        return this.#txEngine.fetchSignatures(wallet, {
            ...(before ? { before } : {}),
            ...(until ? { until } : {}),
            limit
        });
    }
}

module.exports = SignatureScanner;
