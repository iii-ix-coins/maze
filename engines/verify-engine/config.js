'use strict';
require('dotenv').config();
const path = require('path');
const config = Object.freeze({
    mintAddress: process.env.MINT_ADDRESS || '',
    holdersDbPath: path.join(__dirname, '..', 'holder-engine', 'data', 'holders.db'),
    txDbPath: path.join(__dirname, '..', 'tx-engine', 'data', 'transactions.db'),
    verifyDbPath: path.join(__dirname, 'data', 'verify.db'),
    verifyIntervalMs: Number(process.env.VERIFY_INTERVAL_MS) > 0 ? Number(process.env.VERIFY_INTERVAL_MS) : 30_000
});
module.exports = { config };
