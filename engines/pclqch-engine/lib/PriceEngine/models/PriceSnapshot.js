'use strict';
const {
    PRICE_SOURCE,
    CONFIDENCE,
    CURRENCY
} = require('../constants');

class PriceSnapshot {
    constructor({
        mintAddress,
        provider,
        source = PRICE_SOURCE.UNKNOWN,
        priceUsd = 0,
        priceSol = 0,
        amount = 1,
        valueUsd = 0,
        valueSol = 0,
        liquidityUsd = 0,
        confidence = CONFIDENCE.UNKNOWN,
        slot = null,
        cached = false,
        success = true,
        timestamp = new Date().toISOString(),
        currency = CURRENCY.USD
    } = {}) {
        if (typeof mintAddress !== 'string' || mintAddress.trim() === '') {
            throw new TypeError('mintAddress is required.');
        }
        if (typeof provider !== 'string' || provider.trim() === '') {
            throw new TypeError('provider is required.');
        }

        const numericFields = [
            ['priceUsd', priceUsd],
            ['priceSol', priceSol],
            ['amount', amount],
            ['valueUsd', valueUsd],
            ['valueSol', valueSol],
            ['liquidityUsd', liquidityUsd]
        ];

        for (const [name, value] of numericFields) {
            if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
                throw new TypeError(`${name} must be a non-negative number.`);
            }
        }

        this.mintAddress = mintAddress.trim();
        this.provider = provider.trim();
        this.source = source;
        this.priceUsd = priceUsd;
        this.priceSol = priceSol;
        this.amount = amount;
        this.valueUsd = valueUsd;
        this.valueSol = valueSol;
        this.liquidityUsd = liquidityUsd;
        this.confidence = confidence;
        this.slot = slot;
        this.cached = Boolean(cached);
        this.success = Boolean(success);
        this.currency = currency;
        this.timestamp = timestamp;
        Object.freeze(this);
    }
}
module.exports = PriceSnapshot;