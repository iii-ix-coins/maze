'use strict';
const axios = require('axios');
const IPriceProvider = require('../interfaces/IPriceProvider');
const PriceSnapshot = require('../models/PriceSnapshot');
const { PRICE_SOURCE, CONFIDENCE, CURRENCY } = require('../constants');
const InvalidPriceError = require('../errors/InvalidPriceError');
const ProviderTimeoutError = require('../errors/ProviderTimeoutError');
const ProviderUnavailableError = require('../errors/ProviderUnavailableError');
const RateLimitError = require('../errors/RateLimitError');

class BaseProvider extends IPriceProvider {
    constructor(providerConfig, engineConfig) {
        super(providerConfig);
        this.engineConfig = engineConfig || {};
        this.client = axios.create(this.buildAxiosConfig());
    }

    buildAxiosConfig() {
        const timeout = Number(this.engineConfig.timeoutMs) || 3000;
        return {
            timeout: timeout,
            headers: this.buildHeaders()
        };
    }

    buildHeaders() {
        return {};
    }

    supportsCurrency(currency) {
        return currency === CURRENCY.USD;
    }

    supports(request) {
        return (
            request &&
            typeof request.mintAddress === 'string' &&
            request.mintAddress.length > 0 &&
            this.supportsCurrency(request.vsCurrency)
        );
    }

    validatePrice(priceUsd) {
        if (typeof priceUsd !== 'number' || !Number.isFinite(priceUsd) || priceUsd <= 0) {
            throw new InvalidPriceError(`Invalid price value: ${priceUsd}`);
        }
    }

    createSnapshot(data) {
        return new PriceSnapshot({
            ...data,
            source: PRICE_SOURCE.API
        });
    }

    calculateConfidence(data) {
        if (data && typeof data === 'object') {
            return CONFIDENCE.HIGH;
        }
        return CONFIDENCE.LOW;
    }

    handleAxiosError(error) {
        if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
            throw new ProviderTimeoutError(`Provider request timed out (${this.engineConfig.timeoutMs || 3000}ms).`);
        }
        if (error.response?.status === 429) {
            throw new RateLimitError('Provider rate limit exceeded.');
        }
        if (error instanceof InvalidPriceError) {
            throw error;
        }
        throw new ProviderUnavailableError(error.message || 'Provider is unavailable.');
    }

    async executeRequest(requestConfig) {
        let lastError;
        const retry = this.engineConfig.retry ?? {};
        const attempts = (retry.count ?? 0) + 1;
        const delayMs = retry.delayMs ?? 500;
        const timeout = Number(this.engineConfig.timeoutMs) || 3000;

        for (let attempt = 1; attempt <= attempts; attempt++) {
            try {
                // افزودن تایم‌اوت صریح به هر درخواست
                const response = await this.client.request({
                    ...requestConfig,
                    timeout
                });
                return response;
            } catch (error) {
                lastError = error;
                const status = error?.response?.status;
                const retryable =
                    status == null ||
                    status === 408 ||
                    status === 425 ||
                    status === 429 ||
                    status >= 500;

                if (attempt < attempts && retryable) {
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                    continue;
                }

                break;
            }
        }
        this.handleAxiosError(lastError);
    }
}

module.exports = BaseProvider;
