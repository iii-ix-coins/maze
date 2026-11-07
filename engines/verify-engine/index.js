'use strict';

require('dotenv').config();

const { config } = require('./config');
const VerifyDatabase = require('./lib/db');
const HolderAgeCalculator = require('./lib/holderAgeCalculator');
const { sleep } = require('./lib/utils');

const DEFAULT_FAST_RETRY_MS = 5_000;

function readPositiveInteger(value, fallback) {
    const number = Number(value);

    if (
        Number.isSafeInteger(number) &&
        number > 0
    ) {
        return number;
    }

    return fallback;
}

const FAST_RETRY_MS =
    readPositiveInteger(
        process.env.VERIFY_FAST_RETRY_MS,
        DEFAULT_FAST_RETRY_MS
    );

async function startEngine() {
    const verifyDb = new VerifyDatabase(
        config.verifyDbPath
    );

    const calculator =
        new HolderAgeCalculator(
            config.holdersDbPath,
            config.txDbPath,
            verifyDb
        );

    let stopping = false;

    const requestStop = signal => {
        if (stopping) {
            return;
        }

        stopping = true;
        console.log(
            `[Verify Engine] Received ${signal}. Shutting down...`
        );
    };

    process.once(
        'SIGINT',
        () => requestStop('SIGINT')
    );

    process.once(
        'SIGTERM',
        () => requestStop('SIGTERM')
    );

    console.log(
        '[Verify Engine] High-Performance Verification Architecture Started.'
    );

    try {
        while (!stopping) {
            const startedAt = Date.now();
            let processedHolders = 0;

            try {
                processedHolders =
                    await calculator.calculateAges();
            } catch (error) {
                console.warn(
                    '[Verify Engine Warning] Calculation cycle failed:',
                    error?.message || error
                );
            }

            if (stopping) {
                break;
            }

            const elapsed =
                Date.now() - startedAt;

            const currentInterval =
                processedHolders === 0
                    ? FAST_RETRY_MS
                    : config.verifyIntervalMs;

            if (processedHolders === 0) {
                console.log(
                    '[Verify Engine] Waiting for data from other engines. ' +
                    `Fast-retry in ${Math.ceil(currentInterval / 1000)}s...`
                );
            }

            const waitTime =
                Math.max(
                    currentInterval - elapsed,
                    0
                );

            await sleep(waitTime);
        }
    } finally {
        try {
            if (
                verifyDb &&
                typeof verifyDb.close === 'function'
            ) {
                verifyDb.close();
            }
        } catch (error) {
            console.warn(
                '[Verify Engine] Database close warning:',
                error?.message || error
            );
        }

        console.log(
            '[Verify Engine] Shutdown complete.'
        );
    }
}

module.exports = {
    startEngine
};

if (require.main === module) {
    startEngine().catch(error => {
        console.error(
            '[Verify Engine Fatal Error]',
            error
        );
        process.exit(1);
    });
}
