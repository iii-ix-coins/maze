'use strict';

class ResumeScanner {
    #signatureScanner;
    #transactionState;
    #lastScanStatus = null;

    constructor({ signatureScanner, transactionState }) {
        if (!signatureScanner) throw new Error('signatureScanner is required.');
        if (!transactionState) throw new Error('transactionState is required.');
        this.#signatureScanner = signatureScanner;
        this.#transactionState = transactionState;
    }

    async *scan({ wallet, limit = 100 }) {
        if (typeof wallet !== 'string' || wallet.trim() === '') {
            throw new TypeError('The wallet or address is not valid');
        }

        const state = await this.#transactionState.load();
        const until = state.lastSignature || undefined;
        const before = state.lastSignature
            ? (state.scanCursorSignature || undefined)
            : undefined;

        this.#lastScanStatus = {
            caughtUp: false,
            limitReached: false,
            stoppedBy: 'not-started',
            pages: 0,
            yielded: 0,
            newestSignature: null,
            oldestSignature: null,
            initialLastSignature: state.lastSignature || null,
            initialScanCursorSignature: state.scanCursorSignature || null
        };

        let count = 0;
        for await (const signature of this.#signatureScanner.scan({
            wallet,
            before,
            until,
            limit,
            status: this.#lastScanStatus
        })) {
            count += 1;
            yield signature;
        }

        if (count > 0) {
            console.log(`[Tx Engine] Processed batch: ${count} signatures verified and queued.`);
        }
    }

    lastScanStatus() {
        return this.#lastScanStatus ? { ...this.#lastScanStatus } : null;
    }

    async reset() {
        await this.#transactionState.reset();
    }

    async state() {
        return this.#transactionState.load();
    }
}

module.exports = ResumeScanner;
