'use strict';

const TxEngine = require('./TxEngine');
const { config } = require('../../config');

const DEFAULT_OPTIONS = Object.freeze({
    concurrency: config.txConcurrency,
    timeout: config.txRequestTimeoutMs,
    retries: config.txRetryLimit,
    retryDelay: config.txRetryBaseDelayMs,
    mode: config.txFetchMode,
    commitment: config.commitment,
    cacheMaxEntries: config.txCacheMaxEntries
});

function createTxEngine(options = {}) {
    const settings = {
        ...DEFAULT_OPTIONS,
        ...options
    };

    const apiKeys =
        options.apiKeys ??
        config.heliusApiKeys;

    if (!Array.isArray(apiKeys) || apiKeys.length === 0) {
        throw new Error(
            'HELIUS_API_KEYS is missing.'
        );
    }

    return new TxEngine({
        apiKeys,
        concurrency: settings.concurrency,
        timeout: settings.timeout,
        retries: settings.retries,
        retryDelay: settings.retryDelay,
        mode: settings.mode,
        commitment: settings.commitment,
        cacheMaxEntries: settings.cacheMaxEntries
    });
}

module.exports = {
    createTxEngine
};
