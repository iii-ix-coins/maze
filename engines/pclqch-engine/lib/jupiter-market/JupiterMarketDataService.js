'use strict';

const {
    JupiterApiClient
} = require('./JupiterApiClient');

const {
    buildNormalizedMarketData,
    addConsistency
} = require('./JupiterMarketDataNormalizer');

class JupiterMarketDataService {
    constructor({
        mintAddress,
        apiClient,
        store,
        statePublisher = null,
        intervalMs = 60000,
        onUpdate = null
    } = {}) {
        const mint = String(mintAddress ?? '').trim();

        if (!mint) {
            throw new TypeError('mintAddress is required.');
        }

        if (!(apiClient instanceof JupiterApiClient)) {
            throw new TypeError(
                'apiClient must be an instance of JupiterApiClient.'
            );
        }

        if (!store || typeof store.publish !== 'function') {
            throw new TypeError(
                'store with publish() is required.'
            );
        }

        this.mintAddress = mint;
        this.apiClient = apiClient;
        this.store = store;
        this.statePublisher = statePublisher;
        this.intervalMs = Math.max(Number(intervalMs) || 60000, 5000);
        this.onUpdate =
            typeof onUpdate === 'function'
                ? onUpdate
                : null;

        this.timer = null;
        this.running = false;
        this.inFlight = false;
        this.stopRequested = false;
        this.lastSuccessfulData = null;
    }

    _publishState(data) {
        if (!this.statePublisher) {
            return;
        }

        try {
            if (typeof this.statePublisher === 'function') {
                this.statePublisher(data);
                return;
            }

            if (
                typeof this.statePublisher.publish === 'function'
            ) {
                this.statePublisher.publish(data);
            }
        } catch (error) {
            console.error(
                '[Jupiter Market Data] State publication failed:',
                error?.message || error
            );
        }
    }

    async runOnce() {
        if (this.inFlight) {
            return null;
        }

        this.inFlight = true;

        const startedAt = Date.now();
        let priceResponse = null;
        let tokenResponse = null;
        const errors = {};

        try {
            try {
                priceResponse = await this.apiClient.getPrices([
                    this.mintAddress
                ]);
            } catch (error) {
                errors.priceV3 = {
                    code: error?.code || 'ERROR',
                    message: error?.message || String(error),
                    status: error?.status ?? null
                };
            }

            try {
                tokenResponse =
                    await this.apiClient.getTokenInformation([
                        this.mintAddress
                    ]);
            } catch (error) {
                errors.tokensV2 = {
                    code: error?.code || 'ERROR',
                    message: error?.message || String(error),
                    status: error?.status ?? null
                };
            }

            if (!priceResponse && !tokenResponse) {
                throw new Error(
                    'Both Jupiter Price V3 and Tokens V2 requests failed.'
                );
            }

            const fullyFresh = Boolean(
                priceResponse &&
                tokenResponse &&
                Object.keys(errors).length === 0
            );

            let normalized = buildNormalizedMarketData({
                mintAddress: this.mintAddress,
                priceResponse,
                tokenResponse,
                fetchedAtMs: Date.now()
            });

            if (this.lastSuccessfulData && !fullyFresh) {
                normalized = {
                    ...normalized,
                    priceV3: normalized.availability.priceV3
                        ? normalized.priceV3
                        : this.lastSuccessfulData.priceV3,
                    tokenV2: normalized.availability.tokensV2
                        ? normalized.tokenV2
                        : this.lastSuccessfulData.tokenV2,
                    availability: {
                        priceV3: Boolean(
                            normalized.availability.priceV3 ||
                            this.lastSuccessfulData.availability?.priceV3
                        ),
                        tokensV2: Boolean(
                            normalized.availability.tokensV2 ||
                            this.lastSuccessfulData.availability?.tokensV2
                        )
                    },
                    raw: {
                        priceV3: normalized.raw?.priceV3 ?? this.lastSuccessfulData.raw?.priceV3 ?? null,
                        tokensV2: normalized.raw?.tokensV2 ?? this.lastSuccessfulData.raw?.tokensV2 ?? null
                    }
                };
            }

            normalized = addConsistency(
                this.lastSuccessfulData,
                normalized
            );

            this.store.publish(normalized);

            if (fullyFresh) {
                this.lastSuccessfulData = normalized;
            }

            const payload = {
                status:
                    Object.keys(errors).length > 0
                        ? 'degraded'
                        : 'ready',
                mintAddress: this.mintAddress,
                startedAt: new Date(startedAt).toISOString(),
                completedAt: new Date().toISOString(),
                durationMs: Date.now() - startedAt,
                availability: normalized.availability,
                data: normalized,
                errors
            };

            this._publishState(payload);

            if (this.onUpdate) {
                try {
                    await this.onUpdate(payload);
                } catch (error) {
                    console.error(
                        '[Jupiter Market Data] onUpdate failed:',
                        error?.message || error
                    );
                }
            }

            return normalized;
        } catch (error) {
            const payload = {
                status: 'degraded',
                mintAddress: this.mintAddress,
                startedAt: new Date(startedAt).toISOString(),
                completedAt: new Date().toISOString(),
                durationMs: Date.now() - startedAt,
                availability: {
                    priceV3: false,
                    tokensV2: false
                },
                data: this.lastSuccessfulData,
                errors: {
                    ...errors,
                    service: {
                        code: error?.code || 'SERVICE_ERROR',
                        message: error?.message || String(error)
                    }
                }
            };

            this._publishState(payload);

            console.error(
                '[Jupiter Market Data] Cycle failed:',
                error?.message || error
            );

            return null;
        } finally {
            this.inFlight = false;
        }
    }

    start({ immediate = true } = {}) {
        if (this.running) {
            return;
        }

        this.running = true;
        this.stopRequested = false;

        const tick = async () => {
            if (!this.running || this.stopRequested) {
                return;
            }

            await this.runOnce();

            if (!this.running || this.stopRequested) {
                return;
            }

            this.timer = setTimeout(
                tick,
                this.intervalMs
            );
        };

        if (immediate) {
            void tick();
            return;
        }

        this.timer = setTimeout(
            tick,
            this.intervalMs
        );
    }

    async stop() {
        this.stopRequested = true;
        this.running = false;

        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }

        while (this.inFlight) {
            await new Promise(resolve =>
                setTimeout(resolve, 25)
            );
        }
    }
}

module.exports = JupiterMarketDataService;
