'use strict';
class Transaction {
    constructor({
        signature,
        slot = null,
        blockTime = null,
        fee = 0,
        err = null,
        raw = null
    }) {
        if (typeof signature !== 'string' || signature.trim() === '') {
            throw new TypeError('Invalid transaction signature.');
        }
        const validNullableNumber = value => value === null ||
            (typeof value === 'number' && Number.isFinite(value) && value >= 0);
        if (!validNullableNumber(slot) || !validNullableNumber(blockTime) ||
            typeof fee !== 'number' || !Number.isFinite(fee) || fee < 0) {
            throw new TypeError('Invalid transaction numeric metadata.');
        }
        this.signature = signature.trim();
        this.slot = slot;
        this.blockTime = blockTime;
        this.fee = fee;
        this.err = err;
        this.raw = raw;
    }
    static fromRpc(raw) {
        if (!raw || typeof raw !== 'object') {
            throw new Error('Raw transaction data is required.');
        }
        const signature =
            raw?.transaction?.signatures?.[0] ||
            raw?.signature ||
            (Array.isArray(raw?.signatures) ? raw.signatures[0] : null);
        if (!signature || typeof signature !== 'string') {
            throw new Error('Invalid transaction signature.');
        }
        const toNonNegativeNumber = value => {
            if (value === null || value === undefined) return null;
            const number = Number(value);
            return Number.isFinite(number) && number >= 0 ? number : null;
        };
        const slot = toNonNegativeNumber(raw?.slot);
        const blockTime = toNonNegativeNumber(raw?.blockTime ?? raw?.timestamp);
        const feeValue = toNonNegativeNumber(raw?.meta?.fee ?? raw?.fee ?? 0);
        const fee = feeValue ?? 0;
        const err = raw?.meta?.err ?? raw?.transactionError ?? null;
        return new Transaction({
            signature,
            slot,
            blockTime,
            fee,
            err,
            raw
        });
    }
}
module.exports = Transaction;