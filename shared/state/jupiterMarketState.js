'use strict';

const fs = require('fs');
const path = require('path');
const { readJsonCached } = require('./readJsonCached');

const STATE_PATH =
    path.join(
        __dirname,
        'jupiter-market-state.json'
    );

function getJupiterMarketState() {
    const state = readJsonCached(STATE_PATH);
    return state && typeof state === 'object' && !Array.isArray(state) ? state : null;
}
function getJupiterMarketStateJson() {
    const state = getJupiterMarketState();
    return state ? JSON.stringify(state) : null;
}

module.exports = {
    getJupiterMarketState,
    getJupiterMarketStateJson,
    STATE_PATH
};
