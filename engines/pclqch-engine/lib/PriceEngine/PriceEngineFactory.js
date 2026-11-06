'use strict';

const ProviderRegistry = require('./ProviderRegistry');
const PriceEngine = require('./PriceEngine');

const JupiterProvider = require('./providers/jupiter');
const BirdeyeProvider = require('./providers/birdeye');
const SolanaTrackerProvider = require('./providers/solanaTracker');
const DexScreenerProvider = require('./providers/dexscreener'); // 🛠 دکس‌اسکرینر

class PriceEngineFactory {
    static create(config) {
        if (!config) {
            throw new TypeError('config is required.');
        }
        const registry = new ProviderRegistry();
        const engineConfig = config.engine ?? {};

        // ثبت دکس‌اسکرینر (رایگان و مخصوص پامپ‌فان)
        if (config.providers.dexscreener && config.providers.dexscreener.enabled) {
            registry.register(new DexScreenerProvider(config.providers.dexscreener, engineConfig));
        }

        if (config.providers.jupiter.enabled) {
            registry.register(new JupiterProvider(config.providers.jupiter, engineConfig));
        }
        if (config.providers.birdeye.enabled) {
            registry.register(new BirdeyeProvider(config.providers.birdeye, engineConfig));
        }
        if (config.providers.solanaTracker.enabled) {
            registry.register(new SolanaTrackerProvider(config.providers.solanaTracker, engineConfig));
        }

        return new PriceEngine(registry);
    }
}

module.exports = PriceEngineFactory;