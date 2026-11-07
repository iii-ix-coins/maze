'use strict';
require('dotenv').config();
const path = require('path');
const { PublicKey } = require('@solana/web3.js');
const rawJupiterKeys = process.env.JUPITER_API_KEYS || '';
const jupiterKeysArray = rawJupiterKeys.split(',').map(k => k.trim()).filter(Boolean);
const rawBirdeyeKeys = process.env.BIRDEYE_API_KEYS || '';
const birdeyeKeysArray = rawBirdeyeKeys.split(',').map(k => k.trim()).filter(Boolean);
const rawSolanaTrackerKeys = process.env.SOLANATRACKER_API_KEYS || '';
const solanaTrackerKeysArray = rawSolanaTrackerKeys.split(',').map(k => k.trim()).filter(Boolean);
const config = Object.freeze({
  mintAddress: process.env.MINT_ADDRESS || '',
  intervalMs: Number(process.env.INTERVAL_MS) > 0 ? Number(process.env.INTERVAL_MS) : 1000,
  dbFile: path.join(__dirname, 'data', 'prices.db'),
  priceEngineConfig: Object.freeze({
    engine: {
      timeoutMs: Number(process.env.PRICE_TIMEOUT_MS) > 0 ? Number(process.env.PRICE_TIMEOUT_MS) : 3000,
      retry: {
        count: Number.isInteger(Number(process.env.PRICE_RETRY_COUNT)) && Number(process.env.PRICE_RETRY_COUNT) >= 0 ? Number(process.env.PRICE_RETRY_COUNT) : 1,
        delayMs: Number(process.env.PRICE_RETRY_DELAY_MS) >= 0 ? Number(process.env.PRICE_RETRY_DELAY_MS) : 150
      }
    },
    providers: {
      dexscreener: {
        enabled: false,
      },
      jupiter: {
        enabled: true,
        publicApi: process.env.JUPITER_API || '',
        apiKeys: jupiterKeysArray
      },
      birdeye: {
        enabled: false,
        publicApi: 'https://public-api.birdeye.so',
        apiKeys: birdeyeKeysArray
      },
      solanaTracker: {
        enabled: false,
        publicApi: 'https://data.solanatracker.io',
        apiKeys: solanaTrackerKeysArray
      }
    }
  })
});
function validateConfig() {
  if (!config.mintAddress) {
    throw new Error('MINT_ADDRESS is missing in .env file.');
  }
  try {
    new PublicKey(config.mintAddress);
  } catch {
    throw new Error('MINT_ADDRESS is not a valid Solana public key.');
  }
  return config;
}
module.exports = {
  config,
  validateConfig
};
