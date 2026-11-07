'use strict';
class Signature {
    #signature;
    #slot;
    #blockTime;
    #err;
    #memo;
    #confirmationStatus;
    constructor(data = {}) {
        if (
            !data ||
            typeof data !== 'object'
        ) {
            throw new TypeError(
                'Signature data must be an object.'
            );
        }
        if (
            typeof data.signature !== 'string' ||
            data.signature.trim() === ''
        ) {
            throw new TypeError(
                'Invalid signature.'
            );
        }
        this.#signature =
            data.signature.trim();
        this.#slot =
            Number.isSafeInteger(data.slot)
                ? data.slot
                : null;
        this.#blockTime =
            Number.isSafeInteger(data.blockTime)
                ? data.blockTime
                : null;
        this.#err =
            data.err ?? null;
        this.#memo =
            typeof data.memo === 'string'
                ? data.memo
                : null;
        this.#confirmationStatus =
            typeof data.confirmationStatus === 'string'
                ? data.confirmationStatus
                : null;
        Object.freeze(this);
    }
    get signature() {
        return this.#signature;
    }
    get slot() {
        return this.#slot;
    }
    get blockTime() {
        return this.#blockTime;
    }
    get err() {
        return this.#err;
    }
    get memo() {
        return this.#memo;
    }
    get confirmationStatus() {
        return this.#confirmationStatus;
    }
    get succeeded() {
        return this.#err === null;
    }
    equals(other) {
        return (
            other instanceof Signature &&
            other.signature === this.#signature
        );
    }
    toObject() {
        return {
            signature:
                this.#signature,
            slot:
                this.#slot,
            blockTime:
                this.#blockTime,
            err:
                this.#err,
            memo:
                this.#memo,
            confirmationStatus:
                this.#confirmationStatus
        };
    }
    toJSON() {
        return this.toObject();
    }
    static fromJSON(data) {
        return new Signature(data);

    }
    static mapRpc(raw) {
        if (
            !raw ||
            typeof raw !== 'object'
        ) {
            throw new TypeError(
                'Invalid RPC signature.'
            );
        }
        return {
            signature:
                raw.signature,
            slot:
                raw.slot,
            blockTime:
                raw.blockTime,
            err:
                raw.err,
            memo:
                raw.memo,
            confirmationStatus:
                raw.confirmationStatus
        };
    }
    static fromRpc(raw) {
        return new Signature(
            Signature.mapRpc(raw)
        );
    }
}
module.exports = Signature;