'use strict';
const BaseProvider = require('./BaseProvider');
const { PROVIDERS } = require('../constants');
const InvalidPriceError = require('../errors/InvalidPriceError');
const RateLimitError = require('../errors/RateLimitError');

class DexScreenerProvider extends BaseProvider {
    constructor(providerConfig, engineConfig) {
        super(providerConfig, engineConfig);
        this.endpoints = [{ url: 'https://api.dexscreener.com', headers: {} }];
        this.currentIndex = 0;
    }

    getName() { return PROVIDERS.DEXSCREENER; }
    isEnabled() { return this.config.enabled; }

    getNextEndpoint() { return this.endpoints[0]; }

    buildRequest(request) {
        return {
            method: 'GET',
            url: `${this.getNextEndpoint().url}/latest/dex/tokens/${request.mintAddress}`,
            headers: {}
        };
    }

    parseResponse(response) {
        if (!response || !response.data || !response.data.pairs) {
            throw new InvalidPriceError('Token not indexed on DexScreener yet.');
        }
        return response.data;
    }

    mapSnapshot(request, data) {
        const solanaPools = data.pairs.filter(p => p.chainId === 'solana');
        if (solanaPools.length === 0) {
            throw new InvalidPriceError('No Solana pools found for this token.');
        }

        // پیدا کردن استخری که بیشترین نقدینگی را دارد
        const bestPool = solanaPools.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];

        const priceUsd = Number(bestPool.priceUsd || 0);
        const liquidityUsd = Number(bestPool.liquidity?.usd || 0);

        this.validatePrice(priceUsd);

        return this.createSnapshot({
            mintAddress: request.mintAddress,
            provider: this.getName(),
            priceUsd,
            liquidityUsd, // نقدینگی را به دقت استخراج می‌کند
            amount: request.amount,
            confidence: 100
        });
    }

    async getPrice(request) {
        try {
            const requestConfig = this.buildRequest(request);
            const response = await this.executeRequest(requestConfig);
            const data = this.parseResponse(response);
            return this.mapSnapshot(request, data);
        } catch (error) {
            if (error.response?.status === 429) {
                throw new RateLimitError('DexScreener rate limit exceeded.');
            }
            throw error;
        }
    }

    async healthCheck() { return true; }
}

module.exports = DexScreenerProvider;