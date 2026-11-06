'use strict';

const BaseProvider = require('./BaseProvider');
const { PROVIDERS, API_PATHS } = require('../constants');
const InvalidPriceError = require('../errors/InvalidPriceError');
const RateLimitError = require('../errors/RateLimitError');

class JupiterProvider extends BaseProvider {
    constructor(providerConfig, engineConfig) {
        super(providerConfig, engineConfig);

        this.endpoints = [];

        const apiKeys = Array.isArray(this.config.apiKeys)
            ? this.config.apiKeys.filter(
                key => typeof key === 'string' && key.trim().length > 0
            )
            : [];

        const baseUrl = (
            this.config.publicApi ||
            'https://api.jup.ag'
        ).replace(/\/+$/, '');

        if (apiKeys.length > 0) {
            for (const key of apiKeys) {
                this.endpoints.push({
                    url: baseUrl,
                    headers: {
                        'x-api-key': key.trim(),
                        'Accept': 'application/json'
                    }
                });
            }
        } else {
            this.endpoints.push({
                url: baseUrl,
                headers: {
                    'Accept': 'application/json'
                }
            });
        }

        this.currentIndex = 0;
    }

    getName() {
        return PROVIDERS.JUPITER;
    }

    isEnabled() {
        return this.config.enabled === true;
    }

    getNextEndpoint() {
        if (this.endpoints.length === 0) {
            throw new Error('No Jupiter endpoints configured.');
        }

        const endpoint = this.endpoints[this.currentIndex];

        this.currentIndex =
            (this.currentIndex + 1) % this.endpoints.length;

        return endpoint;
    }

    buildRequest(request) {
        if (!request || typeof request.mintAddress !== 'string') {
            throw new TypeError(
                'Jupiter request must contain a valid mintAddress.'
            );
        }

        const endpoint = this.getNextEndpoint();

        return {
            method: 'GET',
            url: `${endpoint.url}${API_PATHS.JUPITER_PRICE}`,
            headers: endpoint.headers,
            params: {
                ids: request.mintAddress
            }
        };
    }

    parseResponse(response, request) {
        if (!response) {
            throw new InvalidPriceError(
                'Jupiter returned no HTTP response.'
            );
        }

        if (!response.data) {
            throw new InvalidPriceError(
                'Jupiter returned an empty response body.'
            );
        }

        const rawData = response.data;

        /*
         * Jupiter Price API V3 returns token data keyed by mint address.
         *
         * Example:
         *
         * {
         *   "<mint>": {
         *      usdPrice: 0.00123,
         *      liquidity: 123456,
         *      ...
         *   }
         * }
         */

        const tokenData = rawData?.[request.mintAddress];

        if (!tokenData) {
            throw new InvalidPriceError(
                `Jupiter returned no price data for mint ${request.mintAddress}.`
            );
        }

        const priceUsd = Number(tokenData.usdPrice);

        if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
            throw new InvalidPriceError(
                `Jupiter returned an invalid usdPrice for mint ${request.mintAddress}.`
            );
        }

        return tokenData;
    }

    mapSnapshot(request, data) {
        const priceUsd = Number(data.usdPrice);

        this.validatePrice(priceUsd);

        const liquidityUsd = Number(
            data.liquidity ?? 0
        );

        return this.createSnapshot({
            mintAddress: request.mintAddress,
            provider: this.getName(),
            priceUsd,
            liquidityUsd: Number.isFinite(liquidityUsd)
                ? Math.max(0, liquidityUsd)
                : 0,
            amount: request.amount,
            confidence: this.calculateConfidence(data)
        });
    }

    async getPrice(request) {
        const requestConfig = this.buildRequest(request);

        try {
            const response = await this.executeRequest(requestConfig);

            return this.mapSnapshot(
                request,
                this.parseResponse(response, request)
            );
        } catch (error) {
            const status = error?.response?.status;

            if (status === 401 || status === 403) {
                throw new InvalidPriceError(
                    'Jupiter authentication failed. Check JUPITER_API_KEY.'
                );
            }

            if (
                status === 429 ||
                error?.message?.toLowerCase().includes('rate limit')
            ) {
                throw new RateLimitError(
                    'Jupiter API rate limit exceeded.'
                );
            }

            throw error;
        }
    }

    async healthCheck() {
        try {
            const request = {
                mintAddress:
                    'So11111111111111111111111111111111111111112',
                amount: 1
            };

            await this.getPrice(request);

            return true;
        } catch {
            return false;
        }
    }
}

module.exports = JupiterProvider;
