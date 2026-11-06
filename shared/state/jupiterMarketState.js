'use strict';

const fs = require('fs');
const path = require('path');

const STATE_PATH =
    path.join(
        __dirname,
        'jupiter-market-state.json'
    );

function getJupiterMarketState() {

    try {

        if (
            !fs.existsSync(
                STATE_PATH
            )
        ) {
            return null;
        }

        const text =
            fs.readFileSync(
                STATE_PATH,
                'utf8'
            );

        if (!text.trim()) {
            return null;
        }

        const state =
            JSON.parse(text);

        if (
            !state ||
            typeof state !== 'object'
        ) {
            return null;
        }

        return state;

    } catch (error) {

        console.error(
            '[Jupiter Market State]',
            error?.message || error
        );

        return null;
    }
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
