'use strict';
const BaseProvider = require('./BaseProvider');
const { PROVIDERS } = require('../constants');
const InvalidPriceError = require('../errors/InvalidPriceError');
const RateLimitError = require('../errors/RateLimitError');

class BirdeyeProvider extends BaseProvider {
    constructor(providerConfig, engineConfig) {
        super(providerConfig, engineConfig);
        this.endpoints = [];

        if (Array.isArray(this.config.apiKeys) && this.config.apiKeys.length > 0) {
            for (const key of this.config.apiKeys) {
                this.endpoints.push({
                    url: this.config.publicApi || 'https://public-api.birdeye.so',
                    headers: { 'X-API-KEY': key, 'x-chain': 'solana' }
                });
            }
        } else {
            this.endpoints.push({ url: 'https://public-api.birdeye.so', headers: { 'x-chain': 'solana' } });
        }
        this.currentIndex = 0;
    }

    getName() { return PROVIDERS.BIRDEYE; }
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
            // 🛠 بازگشت به اندپوینت سبک قیمت (رفع کامل ارور 400 Bad Request)
            url: `${endpoint.url}/defi/price`,
            headers: endpoint.headers,
            params: { address: request.mintAddress }
        };
    }

    parseResponse(response) {
        if (!response?.data?.data) {
            throw new InvalidPriceError('Birdeye returned invalid structure.');
        }
        return response.data.data;
    }

    mapSnapshot(request, data) {
        const priceUsd = Number(data.value ?? data.price ?? 0);
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
            this.validateResponse(data);
            return this.mapSnapshot(request, data);
        } catch (error) {
            if (error.response?.status === 429 || error.response?.status === 401 || error.message?.includes('rate limit')) {
                throw new RateLimitError('Birdeye rate limit exceeded.');
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
module.exports = BirdeyeProvider;