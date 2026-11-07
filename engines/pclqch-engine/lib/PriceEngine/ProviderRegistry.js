'use strict';
const IPriceProvider =
    require('./interfaces/IPriceProvider');
class ProviderRegistry {
    constructor() {
        this.providers =
            new Map();
    }
    register(provider) {
        if (!(provider instanceof IPriceProvider)) {
            throw new TypeError(
                'Provider must extend IPriceProvider.'
            );
        }
        const name =
            provider.getName();
        if (this.providers.has(name)) {
            throw new Error(
                `Provider "${name}" already registered.`
            );
        }
        this.providers.set(
            name,
            provider
        );
        return provider;
    }
    unregister(name) {
        return this.providers.delete(name);
    }
    has(name) {
        return this.providers.has(name);
    }
    get(name) {
        return this.providers.get(name) || null;
    }
    getAll() {
        return Array.from(
            this.providers.values()
        );
    }
    getEnabled() {
        return this.getAll()
            .filter(
                provider =>
                    provider.isEnabled()
            );
    }
    getSupported(request) {
        return this.getEnabled()
            .filter(
                provider =>
                    provider.supports(request)
            );
    }
    clear() {
        this.providers.clear();
    }
    get size() {
        return this.providers.size;
    }
}
module.exports =
    ProviderRegistry;