'use strict';
class TransactionState {
    constructor(db) {
        if (!db) throw new Error("Database instance is required for TransactionState");
        this.db = db;
    }
    async load() {
        return this.db.getState();
    }
    async save(state) {
        if (!state || typeof state !== 'object') {
            throw new TypeError('Invalid transaction state.');
        }
        const payload = {
            ...await this.load(),
            ...state,
            updatedAt: new Date().toISOString()
        };
        await this.db.updateState(payload);
        return payload;
    }
    async reset() {
        const defaultState = {
            version: 1,
            updatedAt: new Date().toISOString(),
            mintAddress: null,
            lastSignature: null,
            oldestSignature: null,
            scanCursorSignature: null,
            scanHeadSignature: null,
            totalTransactions: 0,
            scanCompleted: false
        };
        await this.db.updateState(defaultState);
        return defaultState;
    }
    async update(values = {}) {
        const current = await this.load();
        return this.save({
            ...current,
            ...values
        });
    }
}
module.exports = TransactionState;