'use strict';
const path = require('path');
const {
    config,
    validateConfig
} = require('./config');
const {
    sleep,
    normalizeError
} = require('./lib/utils');
const InteractionDatabase =
    require('./db');
const {
    setInteractionState,
    flushInteractionState
} = require('../../shared/state/interactionState');
const {
    createInteractionServer
} = require('./server');
const DB_PATH =
    path.join(
        __dirname,
        'data',
        'interactions.db'
    );
function publishState(
    db,
    status = 'ready',
    error = null
) {
    const stats =
        db.getStats();
    setInteractionState({
        status,
        stats,
        eventCount:
            db.countEvents(),
        lastUpdatedAt:
            new Date().toISOString(),
        lastError:
            error
                ? String(error)
                : null
    });
    return stats;
}
async function startEngine() {
    validateConfig();
    const db =
        new InteractionDatabase(
            DB_PATH
        );
    let server = null;
    let shuttingDown = false;
    const shutdown = async (
        signal
    ) => {
        if (shuttingDown) {
            return;
        }
        shuttingDown = true;
        console.log(
            `[Interaction Engine] Received ${signal}. Shutting down...`
        );
        try {
            publishState(
                db,
                'stopping'
            );
        } catch (error) {
            const normalized =
                normalizeError(
                    error
                );
            console.error(
                '[Interaction Engine] Failed to publish stopping state:',
                normalized.message
            );
        }
        if (server) {
            await new Promise(resolve => {
                server.close(() => {
                    console.log(
                        '[Interaction Engine] HTTP server closed.'
                    );
                    resolve();
                });
            });
        }
        try {
            await flushInteractionState();
            console.log(
                '[Interaction Engine] Pending state flushed.'
            );
        } catch (error) {
            const normalized =
                normalizeError(
                    error
                );
            console.error(
                '[Interaction Engine] Final state flush failed:',
                normalized.message
            );
        }
        try {
            publishState(
                db,
                'stopped'
            );
            await flushInteractionState();
        } catch (error) {
            const normalized =
                normalizeError(
                    error
                );
            console.error(
                '[Interaction Engine] Failed to publish final stopped state:',
                normalized.message
            );
        }
        try {
            db.close();
            console.log(
                '[Interaction Engine] Database closed.'
            );
        } catch (error) {
            const normalized =
                normalizeError(
                    error
                );
            console.error(
                '[Interaction Engine] Database close failed:',
                normalized.message
            );
        }
        process.exit(0);
    };
    try {
        publishState(
            db,
            'starting'
        );
        await flushInteractionState();
        const app =
            createInteractionServer({
                db,

                publishState: () => {
                    if (!shuttingDown) {
                        publishState(
                            db,
                            'ready'
                        );
                    }
                }
            });

        server =
            app.listen(
                config.port,
                config.host,
                () => {
                    console.log(
                        `[Interaction Engine] Listening on http://${config.host}:${config.port}`
                    );

                    console.log(
                        `[Interaction Engine] Event retention: ${config.eventRetentionDays} days`
                    );

                    console.log(
                        `[Interaction Engine] Request timeout: ${config.requestTimeoutMs}ms`
                    );
                }
            );

        server.on(
            'error',
            error => {
                const normalized =
                    normalizeError(
                        error
                    );

                console.error(
                    '[Interaction Engine] Server error:',
                    normalized.message
                );

                if (!shuttingDown) {
                    shuttingDown = true;

                    process.exitCode = 1;

                    const shutdownOnServerError =
                        async () => {
                            try {
                                publishState(
                                    db,
                                    'degraded',
                                    normalized.message
                                );

                                await flushInteractionState();

                            } catch (stateError) {
                                console.error(
                                    '[Interaction Engine] Failed to publish server-error state:',
                                    stateError?.message ||
                                    stateError
                                );
                            }

                            if (server) {
                                await new Promise(
                                    resolve => {
                                        server.close(
                                            () => resolve()
                                        );
                                    }
                                ).catch(() => {
                                    // Ignore server close failure.
                                });
                            }

                            try {
                                db.close();
                            } catch (dbError) {
                                console.error(
                                    '[Interaction Engine] Database close failed:',
                                    dbError?.message ||
                                    dbError
                                );
                            }

                            process.exit(1);
                        };

                    void shutdownOnServerError();
                }
            }
        );

        process.once(
            'SIGINT',
            () => shutdown('SIGINT')
        );

        process.once(
            'SIGTERM',
            () => shutdown('SIGTERM')
        );

        let lastCleanup =
            Date.now();

        while (!shuttingDown) {
            const now =
                Date.now();

            if (
                now - lastCleanup >=
                config.cleanupIntervalMs
            ) {
                const cutoff =
                    now -
                    (
                        config.eventRetentionDays *
                        24 *
                        60 *
                        60 *
                        1000
                    );

                try {
                    const deleted =
                        db.cleanupOlderThan(
                            cutoff
                        );

                    if (deleted > 0) {
                        console.log(
                            `[Interaction Engine] Cleaned ${deleted} old interaction events.`
                        );
                    }

                    publishState(
                        db,
                        'ready'
                    );

                } catch (error) {
                    const normalized =
                        normalizeError(
                            error
                        );

                    console.error(
                        '[Interaction Engine] Cleanup failed:',
                        normalized.message
                    );

                    try {
                        publishState(
                            db,
                            'degraded',
                            normalized.message
                        );
                        await flushInteractionState();
                    } catch {
                        // Ignore secondary state errors.
                    }
                }

                lastCleanup =
                    now;
            }

            await sleep(1000);
        }

    } catch (error) {
        const normalized =
            normalizeError(
                error
            );

        console.error(
            '[Interaction Engine Fatal Error]',
            normalized
        );

        try {
            publishState(
                db,
                'degraded',
                normalized.message
            );
        } catch {
            // Ignore state publication failure.
        }

        try {
            if (server) {
                await new Promise(resolve => {
                    server.close(() => resolve());
                });
            }
        } catch {
            // Ignore close failure.
        }

        try {
            db.close();
        } catch {
            // Ignore database close failure.
        }

        throw normalized;
    }
}

if (
    require.main === module
) {
    startEngine().catch(
        error => {
            console.error(
                '[Interaction Engine Fatal Error]',
                error?.message ||
                error
            );

            process.exit(1);
        }
    );
}

module.exports = {
    startEngine,
    publishState
};