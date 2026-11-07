'use strict';
const { CURRENCY } = require('../constants');
class PriceRequest {
    constructor({
        mintAddress,
        tokenProgram = null,
        decimals = 0,
        amount = 1,
        vsCurrency = CURRENCY.USD,
        allowCache = true,
        allowFallback = true,
        requestTime = new Date().toISOString()
    } = {}) {
        if (
            typeof mintAddress !== 'string' ||
            mintAddress.trim() === ''
        ) {
            throw new TypeError(
                'mintAddress is required.'
            );
        }
        if (
            !Number.isInteger(decimals) ||
            decimals < 0
        ) {
            throw new TypeError(
                'decimals must be a non-negative integer.'
            );
        }
        if (
            typeof amount !== 'number' ||
            !Number.isFinite(amount) ||
            amount <= 0
        ) {
            throw new TypeError(
                'amount must be greater than zero.'
            );
        }
        if (
            !Object.values(CURRENCY).includes(vsCurrency)
        ) {
            throw new TypeError(
                `Unsupported currency: ${vsCurrency}`
            );
        }
        this.mintAddress =
            mintAddress.trim();
        this.tokenProgram =
            tokenProgram
                ? tokenProgram.trim()
                : null;
        this.decimals =
            decimals;
        this.amount =
            amount;
        this.vsCurrency =
            vsCurrency;
        this.allowCache =
            Boolean(allowCache);
        this.allowFallback =
            Boolean(allowFallback);
        this.requestTime = new Date(requestTime).toISOString();
        Object.freeze(this);
    }
}
module.exports = PriceRequest;