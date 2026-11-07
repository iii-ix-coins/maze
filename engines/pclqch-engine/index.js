'use strict';

const { config, validateConfig } = require('./config');
const { sleep } = require('./lib/utils');
const PriceDatabase = require('./lib/db');
const PriceAnalyzer = require('./lib/priceAnalyzer');
const PriceEngineFactory = require('./lib/PriceEngine/PriceEngineFactory');
const PriceRequest = require('./lib/PriceEngine/models/PriceRequest');

const {
    setPriceState
} = require('../../shared/state/priceState');

let lastValidLiquidityUsd = 0;

async function startEngine() {
    validateConfig();

    const priceEngine = PriceEngineFactory.create(
        config.priceEngineConfig
    );

    const db = new PriceDatabase(
        config.dbFile
    );

    const priceAnalyzer = new PriceAnalyzer(
        db
    );

    const request = new PriceRequest({
        mintAddress: config.mintAddress,
        allowCache: false
    });

    console.log(
        '[PCLQCH Engine] Started as independent process.'
    );

    console.log(
        `[PCLQCH Engine] Interval: ${config.intervalMs}ms`
    );

    let tickCount = 0;
    let consecutiveFailures = 0;

    while (true) {
        const startedAt = Date.now();

        try {
            const snapshot =
                await priceEngine.getPrice(request);

            const changes =
                priceAnalyzer.calculateChanges(snapshot);

            if (
                snapshot.provider === 'jupiter' &&
                Number(snapshot.liquidityUsd) > 0
            ) {
                lastValidLiquidityUsd =
                    Number(snapshot.liquidityUsd);
            }

            const finalLiquidity =
                lastValidLiquidityUsd > 0
                    ? lastValidLiquidityUsd
                    : Number(snapshot.liquidityUsd || 0);

            const recordToSave = {
                timestamp: snapshot.timestamp,
                priceUsd: snapshot.priceUsd,
                liquidityUsd: finalLiquidity,
                provider: snapshot.provider,
                changes
            };

            /*
             * 1. Persist historical record.
             */
            db.insertRecord(
                recordToSave
            );

            /*
             * 2. Publish latest state
             *    for the Web process.
             */
            setPriceState(
                recordToSave
            );

            tickCount++;
            consecutiveFailures = 0;

            if (tickCount >= 100) {
                db.cleanOldRecords(15);
                tickCount = 0;
            }

        } catch (error) {
            consecutiveFailures += 1;
            console.warn(
                '[PCLQCH Engine Warning] Skipped tick:',
                error?.message || error
            );
        }

        const elapsed =
            Date.now() - startedAt;

        const failureBackoff = consecutiveFailures > 0
            ? Math.min(15_000, Math.max(1_000, 1_000 * (2 ** Math.min(consecutiveFailures - 1, 3))))
            : config.intervalMs;

        const waitTime =
            Math.max(
                config.intervalMs - elapsed,
                failureBackoff - elapsed,
                1_000
            );

        await sleep(waitTime);
    }
}

if (require.main === module) {
    startEngine().catch(error => {
        console.error(
            '[PCLQCH Engine Fatal Error]',
            error
        );

        process.exit(1);
    });
}

module.exports = {
    startEngine
};
