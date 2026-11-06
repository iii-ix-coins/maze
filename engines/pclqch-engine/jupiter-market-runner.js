'use strict';

const path = require('path');

/*
 * -------------------------------------------------------------
 * Environment bootstrap
 *
 * This runner can be executed directly:
 *
 *     node engines/pclqch-engine/jupiter-market-runner.js
 *
 * Therefore it must load the project root .env itself.
 *
 * This does NOT modify the existing PCLQCH PriceEngine.
 * -------------------------------------------------------------
 */
require('dotenv').config({
    path: path.join(
        __dirname,
        '..',
        '..',
        '.env'
    )
});

const {
    config,
    validateConfig
} = require('./lib/jupiter-market/config');

const {
    JupiterApiClient
} = require('./lib/jupiter-market/JupiterApiClient');

const JupiterMarketDataStore =
    require('./lib/jupiter-market/JupiterMarketDataStore');

const JupiterMarketDataService =
    require('./lib/jupiter-market/JupiterMarketDataService');

const AtomicStatePublisher =
    require('./lib/jupiter-market/AtomicStatePublisher');

/*
 * -------------------------------------------------------------
 * Paths
 * -------------------------------------------------------------
 */

const DB_PATH = path.join(
    __dirname,
    'data',
    'jupiter-market.db'
);

const STATE_PATH = path.join(
    __dirname,
    '..',
    '..',
    'shared',
    'state',
    'jupiter-market-state.json'
);

/*
 * -------------------------------------------------------------
 * Main
 * -------------------------------------------------------------
 */

async function main() {
    if (!config.enabled) {
        console.log(
            '[Jupiter Market Data] Disabled. ' +
            'Set JUPITER_MARKET_DATA_ENABLED=true to enable.'
        );

        return;
    }

    validateConfig(config);

    const apiClient =
        new JupiterApiClient({
            apiKey:
                config.apiKey,

            baseUrl:
                config.baseUrl,

            timeoutMs:
                config.requestTimeoutMs,

            maxRetries:
                config.maxRetries,

            requestGapMs:
                config.requestGapMs
        });

    const store =
        new JupiterMarketDataStore({
            dbPath:
                DB_PATH,

            historyEnabled:
                config.historyEnabled,

            historyRetentionDays:
                config.historyRetentionDays
        });

    const statePublisher =
        new AtomicStatePublisher(
            STATE_PATH
        );

    const service =
        new JupiterMarketDataService({
            mintAddress:
                config.mintAddress,

            apiClient,

            store,

            statePublisher,

            intervalMs:
                config.intervalMs,

            onUpdate:
                payload => {
                    console.log(
                        `[Jupiter Market Data] ` +
                        `status=${payload.status} ` +
                        `priceV3=${payload.availability.priceV3} ` +
                        `tokensV2=${payload.availability.tokensV2} ` +
                        `duration=${payload.durationMs}ms`
                    );
                }
        });

    let stopping = false;

    const shutdown =
        async signal => {
            if (stopping) {
                return;
            }

            stopping = true;

            console.log(
                `[Jupiter Market Data] ` +
                `Received ${signal}. ` +
                `Shutting down...`
            );

            try {
                await service.stop();
            } finally {
                store.close();
            }
        };

    process.once(
        'SIGINT',
        () => {
            void shutdown(
                'SIGINT'
            ).then(() => {
                process.exitCode = 0;
            });
        }
    );

    process.once(
        'SIGTERM',
        () => {
            void shutdown(
                'SIGTERM'
            ).then(() => {
                process.exitCode = 0;
            });
        }
    );

    console.log(
        '[Jupiter Market Data] ' +
        'Independent collection service started.'
    );

    service.start({
        immediate: true
    });
}

main().catch(error => {
    console.error(
        '[Jupiter Market Data Fatal]',
        error
    );

    process.exitCode = 1;
});
