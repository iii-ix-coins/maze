'use strict';
const ENGINE = Object.freeze({
  NAME: 'PriceEngine',
  VERSION: '1.0.0'
});
const API_PATHS = Object.freeze({
  JUPITER_PRICE: '/price/v3',
  BIRDEYE_PRICE: '/defi/price',
  SOLANATRACKER_PRICE: '/tokens/:mint'
});
const PROVIDERS = Object.freeze({
  JUPITER: 'jupiter',
  BIRDEYE: 'birdeye',
  SOLANA_TRACKER: 'solanaTracker',
  DEXSCREENER: 'dexscreener' // 🛠 پرووایدر جدید اضافه شد
});
const PROVIDER_STATUS = Object.freeze({
  ENABLED: 'enabled',
  DISABLED: 'disabled',
  FAILED: 'failed'
});
const PROVIDER_PRIORITY = Object.freeze([
  PROVIDERS.DEXSCREENER,
  PROVIDERS.JUPITER,
  PROVIDERS.BIRDEYE,
  PROVIDERS.SOLANA_TRACKER
]);
const CACHE = Object.freeze({
  DEFAULT_KEY: 'token-price'
});
const HTTP = Object.freeze({
  GET: 'GET',
  POST: 'POST'
});
const TOKEN_PROGRAMS = Object.freeze({
  SPL_TOKEN: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  TOKEN_2022: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'
});
const PRICE_SOURCE = Object.freeze({
  API: 'api',
  CACHE: 'cache',
  UNKNOWN: 'unknown'
});
const CONFIDENCE = Object.freeze({
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  UNKNOWN: 'unknown'
});
const PRECISION = Object.freeze({
  USD_DECIMALS: 12,
  SOL_DECIMALS: 9
});
const SOLANA = Object.freeze({
  LAMPORTS_PER_SOL: 1_000_000_000
});
const POOL = Object.freeze({
  DEFAULT_SLIPPAGE_BPS: 50
});
const VALIDATION = Object.freeze({
  MIN_PRICE_USD: 0,
  MIN_LIQUIDITY_USD: 0
});
const PRICE_STATUS = Object.freeze({
  SUCCESS: 'success',
  FALLBACK: 'fallback',
  STALE: 'stale',
  FAILED: 'failed'
});
const ERROR_CODES = Object.freeze({
  INVALID_PRICE: 'INVALID_PRICE',
  PROVIDER_TIMEOUT: 'PROVIDER_TIMEOUT',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  POOL_NOT_FOUND: 'POOL_NOT_FOUND',
  RATE_LIMIT: 'RATE_LIMIT'
});
const CONFIDENCE_SCORE = Object.freeze({
  HIGH: 100,
  MEDIUM: 70,
  LOW: 40,
  UNKNOWN: 0
});
const CURRENCY = Object.freeze({
  USD: 'USD',
  SOL: 'SOL'
});

module.exports = {
  ENGINE,
  API_PATHS,
  PROVIDERS,
  PROVIDER_STATUS,
  PROVIDER_PRIORITY,
  CACHE,
  HTTP,
  TOKEN_PROGRAMS,
  PRICE_SOURCE,
  CONFIDENCE,
  PRECISION,
  SOLANA,
  POOL,
  VALIDATION,
  PRICE_STATUS,
  ERROR_CODES,
  CONFIDENCE_SCORE,
  CURRENCY
};