'use strict';
const ProviderUnavailableError = require('./errors/ProviderUnavailableError');

class PriceEngine {
    constructor(registry) {
        if (!registry) {
            throw new TypeError('registry is required.');
        }
        this.registry = registry;

        this.globalRotationIndex = 0;
    }

    async getPrice(request) {
        if (!request) {
            throw new TypeError('request is required.');
        }

        let providers = this.registry.getSupported(request);

        if (providers.length === 0) {
            throw new ProviderUnavailableError('No provider available.');
        }

        if (providers.length > 1) {
            const shift = this.globalRotationIndex % providers.length;
            providers = [...providers.slice(shift), ...providers.slice(0, shift)];
            this.globalRotationIndex++;
        }

        let lastError;
        for (const provider of providers) {
            console.log(`[PriceEngine] Trying ${provider.getName()}`);
            try {
                const result = await this.getPriceFrom(provider, request);
                console.log(`[PriceEngine] ${provider.getName()} SUCCESS`);
                return result;
            }
            catch (error) {
                console.warn(`[PriceEngine] ${provider.getName()} FAILED: ${error.message}`);
                lastError = error;
            }
        }

        throw lastError;
    }

    async getPriceFrom(provider, request) {
        return provider.getPrice(request);
    }

    async healthCheck() {
        const result = {};
        const providers = this.registry.getAll();
        for (const provider of providers) {
            result[provider.getName()] = await provider.healthCheck();
        }
        return result;
    }

    async destroy() {
        if (!this.registry) return;
        const providers = this.registry.getAll();
        for (const provider of providers) {
            await provider.destroy();
        }
        this.registry = null;
    }
}

module.exports = PriceEngine;