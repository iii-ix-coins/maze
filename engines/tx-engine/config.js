'use strict';

require('dotenv').config();

const { PublicKey } = require('@solana/web3.js');

/*
 * =========================================================
 * Defaults
 * =========================================================
 */

const DEFAULT_RPC_URL = 'https://api.mainnet-beta.solana.com';
const DEFAULT_WS_URL = 'wss://atlas-mainnet.helius-rpc.com/';
const DEFAULT_WS_COMMITMENT = 'confirmed';

const DEFAULT_SCAN_INTERVAL_SECONDS = 30;
const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_TX_LIMIT = 100;
const DEFAULT_TX_CONCURRENCY = 4;
const DEFAULT_TX_REQUEST_TIMEOUT_MS = 20_000;
const DEFAULT_TX_RETRY_LIMIT = 2;
const DEFAULT_TX_RETRY_BASE_DELAY_MS = 500;
const DEFAULT_TX_CACHE_MAX_ENTRIES = 50_000;
const DEFAULT_COMMITMENT = 'confirmed';

const DEFAULT_WS_SUBSCRIPTION_ID = 1;
const DEFAULT_WS_CONNECT_TIMEOUT_MS = 10_000;
const DEFAULT_WS_HEARTBEAT_INTERVAL_MS = 20_000;
const DEFAULT_WS_INACTIVITY_TIMEOUT_MS = 90_000;
const DEFAULT_WS_CLOSE_TIMEOUT_MS = 5_000;
const DEFAULT_WS_MAX_MESSAGE_BYTES = 20 * 1024 * 1024;
const DEFAULT_WS_RECONNECT_BASE_DELAY_MS = 1_000;
const DEFAULT_WS_RECONNECT_MAX_DELAY_MS = 30_000;
const DEFAULT_WS_RECONNECT_JITTER_MS = 500;
const DEFAULT_WS_MAX_RECONNECT_ATTEMPTS = 10;
const DEFAULT_WS_MAX_SUPPORTED_TRANSACTION_VERSION = 1;
const DEFAULT_WS_403_COOLDOWN_MS = 5 * 60 * 1000;
const DEFAULT_WS_START_DELAY_MS = 0;
const DEFAULT_WS_DEDUP_TTL_MS = 10 * 60 * 1000;
const DEFAULT_WS_DEDUP_MAX_ENTRIES = 100_000;
const DEFAULT_WS_INGESTION_BATCH_SIZE = 1_000;

/*
 * =========================================================
 * Allowed values
 * =========================================================
 */

const VALID_COMMITMENTS = Object.freeze(
    new Set([
        'processed',
        'confirmed',
        'finalized'
    ])
);

/*
 * =========================================================
 * Environment helpers
 * =========================================================
 */

function normalizeString(value, fallback = '') {
    if (typeof value !== 'string') {
        return fallback;
    }

    const normalized = value.trim();

    return normalized !== ''
        ? normalized
        : fallback;
}

function readPositiveInteger(value, fallback) {
    if (
        value === undefined ||
        value === null ||
        String(value).trim() === ''
    ) {
        return fallback;
    }

    const number = Number(value);

    if (
        Number.isSafeInteger(number) &&
        number > 0
    ) {
        return number;
    }

    return fallback;
}

function readNonNegativeInteger(value, fallback) {
    if (
        value === undefined ||
        value === null ||
        String(value).trim() === ''
    ) {
        return fallback;
    }

    const number = Number(value);

    if (
        Number.isSafeInteger(number) &&
        number >= 0
    ) {
        return number;
    }

    return fallback;
}

function readBoolean(value, fallback) {
    if (
        value === undefined ||
        value === null ||
        String(value).trim() === ''
    ) {
        return fallback;
    }

    switch (
        String(value)
            .trim()
            .toLowerCase()
    ) {
        case 'true':
        case '1':
        case 'yes':
        case 'on':
            return true;

        case 'false':
        case '0':
        case 'no':
        case 'off':
            return false;

        default:
            return fallback;
    }
}

function readReconnectAttempts(
    value,
    fallback = DEFAULT_WS_MAX_RECONNECT_ATTEMPTS
) {
    if (
        value === undefined ||
        value === null ||
        String(value).trim() === ''
    ) {
        return fallback;
    }

    const normalized = String(value)
        .trim()
        .toLowerCase();

    if (
        normalized === 'infinity' ||
        normalized === 'inf'
    ) {
        return Infinity;
    }

    const number = Number(normalized);

    if (
        Number.isSafeInteger(number) &&
        number >= 0
    ) {
        return number;
    }

    return fallback;
}

/*
 * =========================================================
 * RPC URLs
 * =========================================================
 */

function collectRpcUrls() {
    const urls = [];

    const primary = normalizeString(
        process.env.RPC_URL
    );

    if (primary) {
        urls.push(primary);
    }

    for (let i = 1; i <= 20; i += 1) {
        const value = process.env[`RPC_URL_${i}`];

        if (typeof value !== 'string') {
            continue;
        }

        const normalized = value.trim();

        if (
            !normalized ||
            urls.includes(normalized)
        ) {
            continue;
        }

        urls.push(normalized);
    }

    return urls.length > 0
        ? urls
        : [DEFAULT_RPC_URL];
}

/*
 * =========================================================
 * Helius API keys
 * =========================================================
 */

function parseHeliusApiKeys() {
    const raw = normalizeString(
        process.env.HELIUS_API_KEYS
    );

    if (!raw) {
        return [];
    }

    const keys = raw
        .split(',')
        .map(key => key.trim())
        .filter(Boolean);

    return [...new Set(keys)];
}

/*
 * =========================================================
 * Environment snapshot
 * =========================================================
 */

const rpcUrls = Object.freeze(
    collectRpcUrls()
);

const heliusApiKeys = Object.freeze(
    parseHeliusApiKeys()
);

/*
 * =========================================================
 * Immutable configuration
 * =========================================================
 */

const config = Object.freeze({
    /* Core transaction target */
    mintAddress: normalizeString(
        process.env.MINT_ADDRESS
    ),

    /* Existing RPC / historical scanner */
    rpcUrls,

    rpcUrl: rpcUrls[0] || DEFAULT_RPC_URL,

    scanIntervalMs: (() => {
        // TX_SCAN_INTERVAL is seconds (current integrated config).
        // TX_DELAY_MS is milliseconds (legacy standalone config).
        const scanSeconds = process.env.TX_SCAN_INTERVAL;
        if (scanSeconds !== undefined && String(scanSeconds).trim() !== '') {
            return readPositiveInteger(scanSeconds, DEFAULT_SCAN_INTERVAL_SECONDS) * 1000;
        }
        const legacyDelayMs = process.env.TX_DELAY_MS;
        if (legacyDelayMs !== undefined && String(legacyDelayMs).trim() !== '') {
            return readPositiveInteger(legacyDelayMs, DEFAULT_SCAN_INTERVAL_SECONDS * 1000);
        }
        return DEFAULT_SCAN_INTERVAL_SECONDS * 1000;
    })(),

    batchSize: readPositiveInteger(
        process.env.TX_BATCH_SIZE ?? process.env.TX_FETCH_BATCH_SIZE,
        DEFAULT_BATCH_SIZE
    ),

    txFetchMode: normalizeString(
        process.env.TX_FETCH_MODE,
        'enhanced'
    ).toLowerCase(),

    txCacheMaxEntries: readPositiveInteger(
        process.env.TX_CACHE_MAX_ENTRIES,
        DEFAULT_TX_CACHE_MAX_ENTRIES
    ),

    txLimit: readPositiveInteger(
        process.env.TX_LIMIT,
        DEFAULT_TX_LIMIT
    ),

    txConcurrency: readPositiveInteger(
        process.env.TX_CONCURRENCY,
        DEFAULT_TX_CONCURRENCY
    ),

    txRequestTimeoutMs: readPositiveInteger(
        process.env.TX_REQUEST_TIMEOUT_MS ??
            process.env.TX_TIMEOUT_MS,
        DEFAULT_TX_REQUEST_TIMEOUT_MS
    ),

    txRetryLimit: readNonNegativeInteger(
        process.env.TX_RETRY_LIMIT,
        DEFAULT_TX_RETRY_LIMIT
    ),

    txRetryBaseDelayMs: readNonNegativeInteger(
        process.env.TX_RETRY_BASE_DELAY_MS,
        DEFAULT_TX_RETRY_BASE_DELAY_MS
    ),

    /* Confirmation commitment shared by signature and transaction requests */
    commitment: normalizeString(process.env.COMMITMENT, DEFAULT_COMMITMENT).toLowerCase(),

    /* Helius credentials */
    heliusApiKeys,

    /* Realtime WebSocket */
    wsEnabled: readBoolean(
        process.env.TX_WS_ENABLED,
        false
    ),

    wsUrl: normalizeString(
        process.env.TX_WS_URL,
        DEFAULT_WS_URL
    ),

    wsCommitment: normalizeString(
        process.env.TX_WS_COMMITMENT,
        DEFAULT_WS_COMMITMENT
    ).toLowerCase(),

    wsSubscriptionId: readPositiveInteger(
        process.env.TX_WS_SUBSCRIPTION_ID,
        DEFAULT_WS_SUBSCRIPTION_ID
    ),

    wsConnectTimeoutMs: readPositiveInteger(
        process.env.TX_WS_CONNECT_TIMEOUT_MS,
        DEFAULT_WS_CONNECT_TIMEOUT_MS
    ),

    wsHeartbeatIntervalMs: readPositiveInteger(
        process.env.TX_WS_HEARTBEAT_INTERVAL_MS,
        DEFAULT_WS_HEARTBEAT_INTERVAL_MS
    ),

    wsInactivityTimeoutMs: readPositiveInteger(
        process.env.TX_WS_INACTIVITY_TIMEOUT_MS,
        DEFAULT_WS_INACTIVITY_TIMEOUT_MS
    ),

    wsCloseTimeoutMs: readPositiveInteger(
        process.env.TX_WS_CLOSE_TIMEOUT_MS,
        DEFAULT_WS_CLOSE_TIMEOUT_MS
    ),

    wsMaxMessageBytes: readPositiveInteger(
        process.env.TX_WS_MAX_MESSAGE_BYTES,
        DEFAULT_WS_MAX_MESSAGE_BYTES
    ),

    wsReconnectBaseDelayMs: readPositiveInteger(
        process.env.TX_WS_RECONNECT_BASE_DELAY_MS,
        DEFAULT_WS_RECONNECT_BASE_DELAY_MS
    ),

    wsReconnectMaxDelayMs: readPositiveInteger(
        process.env.TX_WS_RECONNECT_MAX_DELAY_MS,
        DEFAULT_WS_RECONNECT_MAX_DELAY_MS
    ),

    wsReconnectJitterMs: readNonNegativeInteger(
        process.env.TX_WS_RECONNECT_JITTER_MS,
        DEFAULT_WS_RECONNECT_JITTER_MS
    ),

    wsMaxReconnectAttempts: readReconnectAttempts(
        process.env.TX_WS_MAX_RECONNECT_ATTEMPTS,
        DEFAULT_WS_MAX_RECONNECT_ATTEMPTS
    ),

    wsStartDelayMs: readNonNegativeInteger(
        process.env.TX_WS_START_DELAY_MS,
        DEFAULT_WS_START_DELAY_MS
    ),

    wsMaxSupportedTransactionVersion: readNonNegativeInteger(
        process.env.TX_WS_MAX_SUPPORTED_TRANSACTION_VERSION,
        DEFAULT_WS_MAX_SUPPORTED_TRANSACTION_VERSION
    ),

    ws403CooldownMs: readPositiveInteger(
        process.env.TX_WS_403_COOLDOWN_MS ??
            process.env.TX_WEBSOCKET_403_COOLDOWN_MS,
        DEFAULT_WS_403_COOLDOWN_MS
    ),

    /* Realtime deduplication */
    wsDedupTtlMs: readPositiveInteger(
        process.env.TX_WS_DEDUP_TTL_MS,
        DEFAULT_WS_DEDUP_TTL_MS
    ),

    wsDedupMaxEntries: readPositiveInteger(
        process.env.TX_WS_DEDUP_MAX_ENTRIES,
        DEFAULT_WS_DEDUP_MAX_ENTRIES
    ),

    /* Realtime ingestion */
    wsIngestionBatchSize: readPositiveInteger(
        process.env.TX_WS_INGESTION_BATCH_SIZE,
        DEFAULT_WS_INGESTION_BATCH_SIZE
    )
});

/*
 * =========================================================
 * Validation helpers
 * =========================================================
 */

function assertUrl(value, name, protocols = []) {
    let parsed;

    try {
        parsed = new URL(value);
    } catch {
        throw new Error(
            `${name} is not a valid URL.`
        );
    }

    if (
        protocols.length > 0 &&
        !protocols.includes(parsed.protocol)
    ) {
        throw new Error(
            `${name} must use one of these protocols: ${protocols.join(', ')}`
        );
    }

    return parsed;
}

/*
 * =========================================================
 * Configuration validation
 * =========================================================
 */

function validateConfig() {
    if (!config.mintAddress) {
        throw new Error(
            'MINT_ADDRESS is missing.'
        );
    }

    try {
        new PublicKey(config.mintAddress);
    } catch {
        throw new Error(
            'Invalid MINT_ADDRESS.'
        );
    }

    if (
        !Array.isArray(config.rpcUrls) ||
        config.rpcUrls.length === 0
    ) {
        throw new Error(
            'At least one RPC URL is required.'
        );
    }

    for (const rpcUrl of config.rpcUrls) {
        assertUrl(
            rpcUrl,
            'RPC URL',
            ['http:', 'https:']
        );
    }

    if (config.heliusApiKeys.length === 0) {
        throw new Error(
            'HELIUS_API_KEYS is missing.'
        );
    }

    if (!['enhanced', 'rpc'].includes(config.txFetchMode)) {
        throw new Error('TX_FETCH_MODE must be either "enhanced" or "rpc".');
    }

    if (!VALID_COMMITMENTS.has(config.commitment)) {
        throw new Error(`Invalid COMMITMENT: ${config.commitment}`);
    }

    if (config.batchSize < 1 || config.batchSize > 100) {
        throw new Error('TX_BATCH_SIZE must be between 1 and 100.');
    }

    if (config.txLimit < 1 || config.txLimit > 10_000) {
        throw new Error('TX_LIMIT must be between 1 and 10000.');
    }

    if (!VALID_COMMITMENTS.has(config.wsCommitment)) {
        throw new Error(
            `Invalid TX_WS_COMMITMENT: ${config.wsCommitment}`
        );
    }

    if (
        config.wsInactivityTimeoutMs <=
        config.wsHeartbeatIntervalMs
    ) {
        throw new Error(
            'TX_WS_INACTIVITY_TIMEOUT_MS must be greater than TX_WS_HEARTBEAT_INTERVAL_MS.'
        );
    }

    if (
        config.wsReconnectMaxDelayMs <
        config.wsReconnectBaseDelayMs
    ) {
        throw new Error(
            'TX_WS_RECONNECT_MAX_DELAY_MS must be greater than or equal to TX_WS_RECONNECT_BASE_DELAY_MS.'
        );
    }

    if (config.wsMaxSupportedTransactionVersion < 1) {
        throw new Error(
            'TX_WS_MAX_SUPPORTED_TRANSACTION_VERSION must be at least 1 for current Solana transaction formats.'
        );
    }

    if (!config.wsEnabled) {
        return config;
    }

    assertUrl(
        config.wsUrl,
        'TX_WS_URL',
        ['wss:']
    );

    if (config.wsSubscriptionId <= 0) {
        throw new Error(
            'TX_WS_SUBSCRIPTION_ID must be positive.'
        );
    }

    if (config.wsDedupMaxEntries < 1) {
        throw new Error(
            'TX_WS_DEDUP_MAX_ENTRIES must be positive.'
        );
    }

    if (config.wsIngestionBatchSize < 1) {
        throw new Error(
            'TX_WS_INGESTION_BATCH_SIZE must be positive.'
        );
    }

    return config;
}

module.exports = {
    config,
    validateConfig
};
