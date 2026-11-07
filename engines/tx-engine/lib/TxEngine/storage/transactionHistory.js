'use strict';
class TransactionHistory {
    #signatures = new Set();
    #ordered = [];
    #oldest = null;
    #newest = null;
    add(signature) {
        if (
            typeof signature !== 'string' ||
            signature.trim() === ''
        ) {
            throw new TypeError(
                'Invalid signature.'
            );
        }
        signature =
            signature.trim();
        if (
            this.#signatures.has(signature)
        ) {
            return false;
        }
        this.#signatures.add(
            signature
        );
        this.#ordered.push(
            signature
        );
        if (
            this.#oldest === null
        ) {
            this.#oldest =
                signature;
        }
        this.#newest =
            signature;
        return true;
    }
    addMany(signatures) {
        if (
            !Array.isArray(signatures)
        ) {
            throw new TypeError(
                'signatures must be an array.'
            );
        }
        let inserted = 0;
        for (const signature of signatures) {
            if (
                this.add(signature)
            ) {
                inserted++;
            }
        }
        return inserted;
    }
    has(signature) {
        if (
            typeof signature !== 'string'
        ) {
            return false;
        }
        return this.#signatures.has(
            signature.trim()
        );
    }
    delete(signature) {
        if (
            typeof signature !== 'string'
        ) {
            return false;
        }
        signature =
            signature.trim();
        if (
            !this.#signatures.delete(signature)
        ) {
            return false;
        }
        const index =
            this.#ordered.indexOf(
                signature
            );
        if (
            index !== -1
        ) {
            this.#ordered.splice(
                index,
                1
            );
        }
        this.#oldest =
            this.#ordered.length > 0
                ? this.#ordered[0]
                : null;
        this.#newest =
            this.#ordered.length > 0
                ? this.#ordered[
                this.#ordered.length - 1
                ]
                : null;
        return true;
    }
    clear() {
        this.#signatures.clear();
        this.#ordered.length = 0;
        this.#oldest = null;
        this.#newest = null;
    }
    size() {
        return this.#signatures.size;
    }
    oldest() {
        return this.#oldest;
    }
    newest() {
        return this.#newest;
    }
    isEmpty() {
        return (
            this.#signatures.size === 0
        );
    }
    toArray() {
        return [
            ...this.#ordered
        ];
    }
    values() {
        return this.toArray();
    }
    statistics() {
        return {
            total:
                this.size(),
            oldest:
                this.#oldest,
            newest:
                this.#newest
        };
    }
}
module.exports = TransactionHistory;