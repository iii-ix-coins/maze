'use strict';
const BaseProvider = require('./BaseProvider');
const { PROVIDERS } = require('../constants');
const InvalidPriceError = require('../errors/InvalidPriceError');
const RateLimitError = require('../errors/RateLimitError');

class SolanaTrackerProvider extends BaseProvider {
    constructor(providerConfig, engineConfig) {
        super(providerConfig, engineConfig);
        this.endpoints = [];

        if (Array.isArray(this.config.apiKeys) && this.config.apiKeys.length > 0) {
            for (const key of this.config.apiKeys) {
                this.endpoints.push({
                    url: this.config.publicApi || 'https://data.solanatracker.io',
                    headers: { 'x-api-key': key }
                });
            }
        } else {
            this.endpoints.push({ url: 'https://data.solanatracker.io', headers: {} });
        }
        this.currentIndex = 0;
    }

    getName() { return PROVIDERS.SOLANA_TRACKER; }
    isEnabled() { return this.config.enabled; }

    getNextEndpoint() {
        const endpoint = this.endpoints[this.currentIndex];
        this.currentIndex = (this.currentIndex + 1) % this.endpoints.length;
        return endpoint;
    }

    buildRequest(request) {
        const endpoint = this.getNextEndpoint();
        return {
            method: 'GET',
            url: `${endpoint.url}/tokens/${request.mintAddress}`,
            headers: endpoint.headers
        };
    }

    parseResponse(response) {
        if (!response || !response.data) {
            throw new InvalidPriceError('SolanaTracker returned empty response.');
        }
        return response.data;
    }

    mapSnapshot(request, data) {
        let priceUsd = 0;

        if (data.pools && data.pools.length > 0) {
            priceUsd = Number(data.pools[0].price?.usd ?? data.pools[0].price ?? 0);
        } else if (data.token) {
            priceUsd = Number(data.token.usdPrice ?? data.token.price ?? 0);
        }

        this.validatePrice(priceUsd);

        return this.createSnapshot({
            mintAddress: request.mintAddress,
            provider: this.getName(),
            priceUsd,
            liquidityUsd: 0, // نقدینگی نمی‌دهد
            amount: request.amount,
            confidence: this.calculateConfidence(data)
        });
    }

    async getPrice(request) {
        try {
            const requestConfig = this.buildRequest(request);
            const response = await this.executeRequest(requestConfig);
            const data = this.parseResponse(response);
            return this.mapSnapshot(request, data);
        } catch (error) {
            if (error.response?.status === 429 || error.message?.includes('rate limit')) {
                throw new RateLimitError('SolanaTracker rate limit exceeded.');
            }
            throw error;
        }
    }

    async healthCheck() {
        try {
            await this.getPrice({ mintAddress: 'So11111111111111111111111111111111111111112' });
            return true;
        } catch { return false; }
    }
}
module.exports = SolanaTrackerProvider;