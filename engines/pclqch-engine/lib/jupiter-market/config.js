'use strict';

function envBoolean(name, fallback) {
    const value = String(process.env[name] ?? '').trim().toLowerCase();

    if (!value) {
        return fallback;
    }

    return [
        '1',
        'true',
        'yes',
        'on'
    ].includes(value);
}

function envInteger(name, fallback, min) {
    const value = Number(process.env[name]);

    if (!Number.isInteger(value) || value < min) {
        return fallback;
    }

    return value;
}

const config = {
    enabled: envBoolean(
        'JUPITER_MARKET_DATA_ENABLED',
        false
    ),

    apiKey:
        String(
            process.env.JUPITER_API_KEY ||
            process.env.PCLQCH_JUPITER_API_KEY ||
            ''
        ).trim(),

    baseUrl:
        String(
            process.env.JUPITER_API_BASE_URL ||
            'https://api.jup.ag'
        ).replace(/\/$/, ''),

    mintAddress:
        String(
            process.env.JUPITER_MARKET_MINT ||
            process.env.MINT_ADDRESS ||
            process.env.TOKEN_MINT ||
            ''
        ).trim(),

    intervalMs: envInteger(
        'JUPITER_MARKET_DATA_INTERVAL_MS',
        60000,
        5000
    ),

    requestTimeoutMs: envInteger(
        'JUPITER_MARKET_DATA_TIMEOUT_MS',
        10000,
        1000
    ),

    requestGapMs: envInteger(
        'JUPITER_MARKET_DATA_REQUEST_GAP_MS',
        1200,
        0
    ),

    maxRetries: envInteger(
        'JUPITER_MARKET_DATA_MAX_RETRIES',
        1,
        0
    ),

    historyEnabled: envBoolean(
        'JUPITER_MARKET_DATA_HISTORY_ENABLED',
        true
    ),

    historyRetentionDays: envInteger(
        'JUPITER_MARKET_DATA_HISTORY_RETENTION_DAYS',
        30,
        1
    )
};

function validateConfig(value = config) {
    if (!value.enabled) {
        return;
    }

    if (!value.mintAddress) {
        throw new Error(
            'Jupiter market data is enabled but no mint address was configured.'
        );
    }

    if (!value.apiKey) {
        throw new Error(
            'Jupiter market data is enabled but JUPITER_API_KEY is missing.'
        );
    }
}

module.exports = {
    config,
    validateConfig
};
