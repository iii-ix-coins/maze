'use strict';

require('dotenv').config();

const { PublicKey } = require('@solana/web3.js');

function positiveInt(
    value,
    fallback,
    min = 1,
    max = Number.MAX_SAFE_INTEGER
) {
    const n = Number(value);

    if (!Number.isInteger(n) || n < min) {
        return fallback;
    }

    return Math.min(n, max);
}

function nonNegativeInt(
    value,
    fallback,
    max = Number.MAX_SAFE_INTEGER
) {
    const n = Number(value);

    if (!Number.isInteger(n) || n < 0) {
        return fallback;
    }

    return Math.min(n, max);
}

const dynamicRpcUrls = [];

const primaryRpcUrl = String(
    process.env.RPC_URL || ''
).trim();

if (primaryRpcUrl) {
    dynamicRpcUrls.push(primaryRpcUrl);
}

for (let i = 1; i <= 20; i += 1) {
    const value = String(
        process.env[`RPC_URL_${i}`] || ''
    ).trim();

    if (
        value &&
        !dynamicRpcUrls.includes(value)
    ) {
        dynamicRpcUrls.push(value);
    }
}

const heliusApiKey = String(
    process.env.HELIUS_API_KEY || ''
).trim();

const heliusRpcUrl = heliusApiKey
    ? `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(heliusApiKey)}`
    : '';

if (
    heliusRpcUrl &&
    !dynamicRpcUrls.some(
        url => url.includes('mainnet.helius-rpc.com')
    )
) {
    dynamicRpcUrls.unshift(heliusRpcUrl);
}

const tokenScanProvider = String(
    process.env.TOKEN_SCAN_PROVIDER || 'auto'
)
    .trim()
    .toLowerCase();

const validTokenScanProviders = new Set([
    'auto',
    'helius-v2',
    'helius-token-accounts',
    'standard'
]);

if (!validTokenScanProviders.has(tokenScanProvider)) {
    throw new Error(
        'TOKEN_SCAN_PROVIDER must be auto / helius-v2 / helius-token-accounts / standard.'
    );
}

const rpcPageSize = positiveInt(
    process.env.RPC_PAGE_SIZE,
    2_000,
    1,
    10_000
);

const rpcMinPageSize = positiveInt(
    process.env.RPC_MIN_PAGE_SIZE,
    500,
    1,
    10_000
);

const rpcPageTimeoutMs = positiveInt(
    process.env.RPC_PAGE_TIMEOUT_MS,
    45_000,
    5_000,
    180_000
);

const rpcRequestAttempts = positiveInt(
    process.env.RPC_REQUEST_ATTEMPTS,
    2,
    1,
    5
);

const config = Object.freeze({
    rpcUrls: dynamicRpcUrls.length > 0
        ? dynamicRpcUrls
        : ['https://api.mainnet-beta.solana.com'],

    rpcUrl:
        dynamicRpcUrls[0] ||
        'https://api.mainnet-beta.solana.com',

    mintAddress: String(
        process.env.MINT_ADDRESS || ''
    ).trim(),

    tokenProgramIdOverride: String(
        process.env.TOKEN_PROGRAM_ID || ''
    ).trim(),

    commitment: String(
        process.env.COMMITMENT || 'confirmed'
    ).trim(),

    intervalSeconds: positiveInt(
        process.env.INTERVAL_SECONDS,
        600,
        1,
        86400
    ),

    tokenScanProvider,

    // Legacy/shared page size. New provider-specific settings below are
    // preferred, but this keeps the older .env key useful.
    rpcPageSize,
    rpcMinPageSize,

    // Helius getTokenAccounts is page/cursor based and is capped at 1000.
    tokenScanPageSize: positiveInt(
        process.env.TOKEN_SCAN_PAGE_SIZE ??
            process.env.RPC_PAGE_SIZE,
        1000,
        1,
        1000
    ),

    // Keep the V2 scan conservative by default. It can be raised later
    // after measuring real RPC latency for this mint.
    programAccountsV2PageSize: positiveInt(
        process.env.PROGRAM_ACCOUNTS_V2_PAGE_SIZE,
        2000,
        1,
        10000
    ),

    tokenScanRequestAttempts: positiveInt(
        process.env.TOKEN_SCAN_REQUEST_ATTEMPTS ??
            process.env.RPC_REQUEST_ATTEMPTS,
        rpcRequestAttempts,
        1,
        5
    ),

    tokenScanRequestTimeoutMs: positiveInt(
        process.env.TOKEN_SCAN_REQUEST_TIMEOUT_MS ??
            process.env.RPC_PAGE_TIMEOUT_MS,
        rpcPageTimeoutMs,
        5000,
        180000
    ),

    tokenScanMaxPages: positiveInt(
        process.env.TOKEN_SCAN_MAX_PAGES,
        100000,
        1,
        1000000
    ),

    classificationBatchSize: positiveInt(
        process.env.CLASSIFICATION_BATCH_SIZE,
        100,
        1,
        100
    ),

    classificationConcurrency: positiveInt(
        process.env.CLASSIFICATION_CONCURRENCY,
        6,
        1,
        32
    ),

    classificationRequestAttempts: positiveInt(
        process.env.CLASSIFICATION_REQUEST_ATTEMPTS,
        2,
        1,
        5
    ),

    classificationRequestTimeoutMs: positiveInt(
        process.env.CLASSIFICATION_REQUEST_TIMEOUT_MS,
        30000,
        5000,
        120000
    ),

    classificationCacheTtlMs: positiveInt(
        process.env.CLASSIFICATION_CACHE_TTL_MS,
        6 * 60 * 60 * 1000,
        60_000,
        7 * 24 * 60 * 60 * 1000
    ),

    classificationUnknownTtlMs: positiveInt(
        process.env.CLASSIFICATION_UNKNOWN_TTL_MS,
        2 * 60 * 1000,
        10_000,
        24 * 60 * 60 * 1000
    ),

    classificationMaxConsecutiveFailures: positiveInt(
        process.env.CLASSIFICATION_MAX_CONSECUTIVE_FAILURES,
        3,
        1,
        20
    ),

    classificationWorkBatchSize: positiveInt(
        process.env.CLASSIFICATION_WORK_BATCH_SIZE,
        600,
        100,
        2000
    ),

    classificationLeaseMs: positiveInt(
        process.env.CLASSIFICATION_LEASE_MS,
        5 * 60 * 1000,
        30_000,
        60 * 60 * 1000
    ),

    classificationLoopIntervalMs: positiveInt(
        process.env.CLASSIFICATION_LOOP_INTERVAL_MS,
        1000,
        250,
        60_000
    ),

    classificationRetryDelayMs: positiveInt(
        process.env.CLASSIFICATION_RETRY_DELAY_MS,
        15_000,
        1000,
        60 * 60 * 1000
    ),

    rankingRebuildDebounceMs: nonNegativeInt(
        process.env.RANKING_REBUILD_DEBOUNCE_MS,
        1500,
        60_000
    ),

    rankingMinRebuildIntervalMs: nonNegativeInt(
        process.env.RANKING_MIN_REBUILD_INTERVAL_MS,
        3000,
        60_000
    ),

    progressLogEveryPages: positiveInt(
        process.env.PROGRESS_LOG_EVERY_PAGES,
        10,
        1,
        10000
    ),

    progressLogEveryAccounts: positiveInt(
        process.env.PROGRESS_LOG_EVERY_ACCOUNTS,
        100000,
        1000,
        10000000
    ),

    rpcRequestAttempts,
    rpcMintTimeoutMs: positiveInt(
        process.env.RPC_MINT_TIMEOUT_MS,
        20000,
        5000,
        120000
    ),
    rpcPageTimeoutMs
});

function validateConfig() {
    if (!config.mintAddress) {
        throw new Error(
            'MINT_ADDRESS is missing in .env file.'
        );
    }

    try {
        new PublicKey(config.mintAddress);
    } catch {
        throw new Error(
            'MINT_ADDRESS is not a valid Solana public key.'
        );
    }

    const validCommitments = new Set([
        'processed',
        'confirmed',
        'finalized'
    ]);

    if (!validCommitments.has(config.commitment)) {
        throw new Error(
            'COMMITMENT must be processed / confirmed / finalized.'
        );
    }

    if (
        !Array.isArray(config.rpcUrls) ||
        config.rpcUrls.length === 0
    ) {
        throw new Error(
            'No RPC URLs configured.'
        );
    }

    return config;
}

module.exports = {
    config,
    validateConfig
};
