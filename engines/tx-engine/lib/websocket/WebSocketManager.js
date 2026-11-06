'use strict';
const EventEmitter =
    require('events');
const {
    HeliusTransactionStream
} = require('./HeliusTransactionStream');
const DEFAULT_RECONNECT_BASE_DELAY_MS =
    1_000;
const DEFAULT_RECONNECT_MAX_DELAY_MS =
    30_000;
const DEFAULT_RECONNECT_JITTER_MS =
    500;
const DEFAULT_MAX_RECONNECT_ATTEMPTS =
    Infinity;
const DEFAULT_START_DELAY_MS =
    0;
const MANAGER_STATE =
    Object.freeze({
        IDLE: 'idle',
        STARTING: 'starting',
        CONNECTED: 'connected',
        RECONNECTING: 'reconnecting',
        STOPPING: 'stopping',
        STOPPED: 'stopped',
        FAILED: 'failed',
    DEGRADED: 'degraded'
    });
class WebSocketManager extends EventEmitter {
    constructor({
        apiKeys,
        mintAddress,
        wsUrl =
        'wss://atlas-mainnet.helius-rpc.com/',
        commitment =
        'confirmed',
        subscriptionId =
        1,
        connectTimeoutMs =
        10_000,
        heartbeatIntervalMs =
        20_000,
        inactivityTimeoutMs =
        90_000,
        closeTimeoutMs =
        5_000,
        maxMessageBytes =
        20 * 1024 * 1024,
        maxSupportedTransactionVersion = 1,
        accessDeniedCooldownMs = 5 * 60 * 1000,
        reconnectBaseDelayMs =
        DEFAULT_RECONNECT_BASE_DELAY_MS,
        reconnectMaxDelayMs =
        DEFAULT_RECONNECT_MAX_DELAY_MS,
        reconnectJitterMs =
        DEFAULT_RECONNECT_JITTER_MS,
        maxReconnectAttempts =
        DEFAULT_MAX_RECONNECT_ATTEMPTS,
        startDelayMs =
        DEFAULT_START_DELAY_MS
    } = {}) {
        super();
        if (
            !Array.isArray(apiKeys)
        ) {
            throw new TypeError(
                'apiKeys must be an array.'
            );
        }
        this.apiKeys =
            apiKeys
                .map(
                    key =>
                        String(
                            key || ''
                        ).trim()
                )
                .filter(Boolean);
        if (
            this.apiKeys.length === 0
        ) {
            throw new Error(
                'At least one Helius API key is required.'
            );
        }
        if (
            typeof mintAddress !== 'string' ||
            mintAddress.trim() === ''
        ) {
            throw new TypeError(
                'mintAddress is required.'
            );
        }
        this.mintAddress =
            mintAddress.trim();
        this.wsUrl =
            wsUrl instanceof URL
                ? wsUrl.toString()
                : String(
                    wsUrl
                ).trim();

        if (
            !this.wsUrl
        ) {
            throw new TypeError(
                'wsUrl is required.'
            );
        }
        this.commitment =
            commitment;
        this.subscriptionId =
            Number.isSafeInteger(
                subscriptionId
            ) &&
                subscriptionId > 0
                ? subscriptionId
                : 1;
        this.streamOptions = {
            connectTimeoutMs,
            heartbeatIntervalMs,
            inactivityTimeoutMs,
            closeTimeoutMs,
            maxMessageBytes,
            maxSupportedTransactionVersion
        };
        this.accessDeniedCooldownMs =
            Number.isSafeInteger(accessDeniedCooldownMs) && accessDeniedCooldownMs > 0
                ? accessDeniedCooldownMs
                : 5 * 60 * 1000;
        this.reconnectBaseDelayMs =
            this.#validatePositiveInteger(
                reconnectBaseDelayMs,
                'reconnectBaseDelayMs'
            );
        this.reconnectMaxDelayMs =
            this.#validatePositiveInteger(
                reconnectMaxDelayMs,
                'reconnectMaxDelayMs'
            );
        if (
            this.reconnectMaxDelayMs <
            this.reconnectBaseDelayMs
        ) {
            throw new RangeError(
                'reconnectMaxDelayMs must be >= reconnectBaseDelayMs.'
            );
        }
        this.reconnectJitterMs =
            this.#validateNonNegativeInteger(
                reconnectJitterMs,
                'reconnectJitterMs'
            );
        if (
            maxReconnectAttempts !== Infinity &&
            (
                !Number.isSafeInteger(
                    maxReconnectAttempts
                ) ||
                maxReconnectAttempts < 0
            )
        ) {
            throw new TypeError(
                'maxReconnectAttempts must be a non-negative integer or Infinity.'
            );
        }
        this.maxReconnectAttempts =
            maxReconnectAttempts;
        this.startDelayMs =
            this.#validateNonNegativeInteger(
                startDelayMs,
                'startDelayMs'
            );
        this.state =
            MANAGER_STATE.IDLE;
        this.currentKeyIndex =
            -1;
        this.currentStream =
            null;
        this.startPromise =
            null;
        this.stopPromise =
            null;
        this.reconnectTimer =
            null;
        this.startDelayTimer =
            null;
        this.accessDeniedTimer =
            null;
        this.accessDeniedUntil =
            null;
        this.stopping =
            false;
        this.reconnectAttempts =
            0;
        this.totalConnections =
            0;
        this.totalReconnects =
            0;
        this.totalTransactions =
            0;
        this.totalErrors =
            0;
        this.lastError =
            null;
        this.lastClose =
            null;
        this.lastConnectedAt =
            null;
        this.lastTransactionAt =
            null;
    }
    #validatePositiveInteger(
        value,
        name
    ) {
        if (
            !Number.isSafeInteger(value) ||
            value <= 0
        ) {
            throw new TypeError(
                `${name} must be a positive integer.`
            );
        }
        return value;
    }
    #validateNonNegativeInteger(
        value,
        name
    ) {
        if (
            !Number.isSafeInteger(value) ||
            value < 0
        ) {
            throw new TypeError(
                `${name} must be a non-negative integer.`
            );
        }
        return value;
    }
    getState() {
        return this.state;
    }
    isRunning() {
        return (
            this.state ===
            MANAGER_STATE.STARTING ||
            this.state ===
            MANAGER_STATE.CONNECTED ||
            this.state ===
            MANAGER_STATE.RECONNECTING
        );
    }
    isConnected() {
        return (
            this.state ===
            MANAGER_STATE.CONNECTED &&
            this.currentStream !== null &&
            this.currentStream.isOpen()
        );
    }
    getCurrentApiKeyIndex() {
        return this.currentKeyIndex;
    }
    getCurrentApiKeyFingerprint() {
        if (
            this.currentKeyIndex < 0 ||
            this.currentKeyIndex >=
            this.apiKeys.length
        ) {
            return null;
        }
        const key =
            this.apiKeys[
            this.currentKeyIndex
            ];
        if (
            key.length <= 8
        ) {
            return `${key.slice(0, 2)}***`;
        }
        return (
            `${key.slice(0, 4)}***${key.slice(-4)}`
        );
    }
    getStats() {
        return {
            state:
                this.state,
            running:
                this.isRunning(),
            connected:
                this.isConnected(),
            currentApiKeyIndex:
                this.currentKeyIndex,
            currentApiKey:
                this.getCurrentApiKeyFingerprint(),
            apiKeyCount:
                this.apiKeys.length,
            reconnectAttempts:
                this.reconnectAttempts,
            totalConnections:
                this.totalConnections,
            totalReconnects:
                this.totalReconnects,
            totalTransactions:
                this.totalTransactions,
            totalErrors:
                this.totalErrors,
            lastError:
                this.lastError,
            lastClose:
                this.lastClose,
            lastConnectedAt:
                this.lastConnectedAt,
            lastTransactionAt:
                this.lastTransactionAt,
            stream:
                this.currentStream
                    ? this.currentStream.getStats()
                    : null
        };
    }
    async start() {
        if (
            this.state ===
            MANAGER_STATE.CONNECTED
        ) {
            return;
        }
        if (
            this.state ===
            MANAGER_STATE.STARTING ||
            this.state ===
            MANAGER_STATE.RECONNECTING
        ) {
            return this.startPromise;
        }
        if (
            this.state ===
            MANAGER_STATE.STOPPING
        ) {
            throw new Error(
                'WebSocketManager is stopping.'
            );
        }
        this.stopping =
            false;
        this.state =
            MANAGER_STATE.STARTING;
        this.emit(
            'starting'
        );
        this.startPromise =
            this.#startInternal();
        try {
            await this.startPromise;
        } finally {
            this.startPromise =
                null;
        }
    }
    async #startInternal() {
        if (
            this.startDelayMs > 0
        ) {
            await new Promise(
                resolve => {
                    this.startDelayTimer =
                        setTimeout(
                            () => {
                                this.startDelayTimer =
                                    null;
                                resolve();
                            },
                            this.startDelayMs
                        );
                }
            );
        }
        if (
            this.stopping
        ) {
            return;
        }
        return this.#connect();
    }
    async #connect() {
        if (
            this.stopping
        ) {
            return;
        }

        this.#clearReconnectTimer();

        const apiKey =
            this.#nextApiKey();

        const stream =
            new HeliusTransactionStream({
                apiKey,
                wsUrl:
                    this.wsUrl,
                mintAddress:
                    this.mintAddress,
                commitment:
                    this.commitment,
                subscriptionId:
                    this.subscriptionId,
                ...this.streamOptions
            });

        this.currentStream =
            stream;

        this.#bindStream(
            stream
        );

        try {

            await stream.connect();

            if (
                this.stopping
            ) {
                await stream.close(
                    1000,
                    'Manager stopping.'
                );

                return;
            }

            this.reconnectAttempts =
                0;

            this.totalConnections++;

            this.lastConnectedAt =
                Date.now();

            this.state =
                MANAGER_STATE.CONNECTED;

            this.emit(
                'connected',
                {
                    apiKeyIndex:
                        this.currentKeyIndex,

                    apiKey:
                        this.getCurrentApiKeyFingerprint(),

                    connectionCount:
                        this.totalConnections
                }
            );

        } catch (error) {

            this.#recordError(
                error
            );

            await this.#disposeStream(
                stream
            );

            if (
                this.stopping
            ) {
                return;
            }

            this.emit(
                'connectionFailed',
                {
                    error
                }
            );

            if (
                error?.statusCode === 403 ||
                error?.code === 'WS_HTTP_403'
            ) {
                this.#enterDegraded(error);
                return;
            }

            this.#scheduleReconnect(
                error
            );
        }
    }
    #nextApiKey() {
        this.currentKeyIndex =
            (
                this.currentKeyIndex + 1
            ) %
            this.apiKeys.length;
        return this.apiKeys[
            this.currentKeyIndex
        ];
    }
    #bindStream(
        stream
    ) {
        stream.on(
            'connecting',
            () => {
                this.emit(
                    'streamConnecting'
                );
            }
        );
        stream.on(
            'open',
            info => {
                this.emit(
                    'streamOpen',
                    info
                );
            }
        );
        stream.on(
            'subscriptionRequest',
            info => {
                this.emit(
                    'subscriptionRequest',
                    info
                );
            }
        );
        stream.on(
            'subscribed',
            info => {
                this.emit(
                    'subscribed',
                    info
                );
            }
        );
        stream.on(
            'subscriptionError',
            info => {
                this.#recordError(
                    info?.error
                );
                this.emit(
                    'subscriptionError',
                    info
                );
            }
        );
        stream.on(
            'transaction',
            notification => {
                this.totalTransactions++;
                this.lastTransactionAt =
                    Date.now();
                this.emit(
                    'transaction',
                    notification
                );
            }
        );
        stream.on(
            'ping',
            info => {
                this.emit(
                    'ping',
                    info
                );
            }
        );
        stream.on(
            'pong',
            info => {
                this.emit(
                    'pong',
                    info
                );
            }
        );
        stream.on(
            'heartbeat',
            info => {
                this.emit(
                    'heartbeat',
                    info
                );
            }
        );
        stream.on(
            'message',
            message => {
                this.emit(
                    'message',
                    message
                );
            }
        );
        stream.on(
            'error',
            error => {
                this.#recordError(
                    error
                );
                this.emit(
                    'streamError',
                    error
                );
            }
        );
        stream.on(
            'close',
            info => {
                this.lastClose = {
                    ...info,
                    at:
                        Date.now()
                };
                this.emit(
                    'streamClose',
                    info
                );
                if (
                    this.stopping
                ) {
                    return;
                }
                if (
                    info?.manual === true
                ) {
                    return;
                }
                this.#scheduleReconnect(
                    info
                );
            }
        );
        stream.on(
            'closing',
            info => {
                this.emit(
                    'streamClosing',
                    info
                );
            }
        );
        stream.on(
            'closed',
            info => {
                this.emit(
                    'streamClosed',
                    info
                );
            }
        );
    }
    #enterDegraded(reason) {
        if (this.stopping) {
            return;
        }

        this.state = MANAGER_STATE.DEGRADED;
        this.accessDeniedUntil = Date.now() + this.accessDeniedCooldownMs;

        this.emit('accessDenied', {
            reason,
            cooldownMs: this.accessDeniedCooldownMs,
            until: this.accessDeniedUntil
        });

        if (this.accessDeniedTimer) {
            clearTimeout(this.accessDeniedTimer);
        }

        this.accessDeniedTimer = setTimeout(() => {
            this.accessDeniedTimer = null;
            if (this.stopping) {
                return;
            }
            this.accessDeniedUntil = null;
            this.reconnectAttempts = 0;
            this.state = MANAGER_STATE.RECONNECTING;
            void this.#connect();
        }, this.accessDeniedCooldownMs);
    }

    #scheduleReconnect(
        reason
    ) {
        if (
            this.stopping
        ) {
            return;
        }
        if (
            this.reconnectTimer
        ) {
            return;
        }
        if (
            this.reconnectAttempts >=
            this.maxReconnectAttempts
        ) {
            this.state =
                MANAGER_STATE.FAILED;
            this.emit(
                'reconnectExhausted',
                {
                    reason,
                    attempts:
                        this.reconnectAttempts
                }
            );
            return;
        }
        this.reconnectAttempts++;
        this.totalReconnects++;
        const delay =
            this.#calculateReconnectDelay(
                this.reconnectAttempts
            );
        this.state =
            MANAGER_STATE.RECONNECTING;
        this.emit(
            'reconnecting',
            {
                attempt:
                    this.reconnectAttempts,
                delayMs:
                    delay,
                reason
            }
        );
        this.reconnectTimer =
            setTimeout(
                async () => {
                    this.reconnectTimer =
                        null;
                    if (
                        this.stopping
                    ) {
                        return;
                    }
                    const previousStream =
                        this.currentStream;
                    if (
                        previousStream
                    ) {
                        await this.#disposeStream(
                            previousStream
                        );
                    }
                    try {
                        await this.#connect();
                    } catch (error) {
                        this.emit(
                            'reconnectFailed',
                            {
                                attempt:
                                    this.reconnectAttempts,
                                error
                            }
                        );
                    }
                },
                delay
            );
    }
    #calculateReconnectDelay(
        attempt
    ) {
        const exponential =
            Math.min(
                this.reconnectMaxDelayMs,
                this.reconnectBaseDelayMs *
                Math.pow(
                    2,
                    Math.max(
                        0,
                        attempt - 1
                    )
                )
            );
        const jitter =
            this.reconnectJitterMs > 0
                ? Math.floor(
                    Math.random() *
                    (
                        this.reconnectJitterMs +
                        1
                    )
                )
                : 0;
        return Math.min(
            exponential + jitter,
            this.reconnectMaxDelayMs +
            this.reconnectJitterMs
        );
    }
    async #disposeStream(
        stream
    ) {
        if (
            !stream
        ) {
            return;
        }
        if (
            this.currentStream ===
            stream
        ) {
            this.currentStream =
                null;
        }
        try {
            await stream.close(
                1000,
                'Manager reconnecting.'
            );
        } catch (error) {
            this.#recordError(
                error
            );
            try {
                stream.terminate();
            } catch {
                // Ignore termination errors.
            }
        }
        this.#unbindStream(
            stream
        );
    }
    #unbindStream(
        stream
    ) {
        if (
            !stream ||
            typeof stream.removeAllListeners !==
            'function'
        ) {
            return;
        }
        stream.removeAllListeners();
    }
    async stop() {
        if (
            this.state ===
            MANAGER_STATE.STOPPED
        ) {
            return;
        }
        if (
            this.state ===
            MANAGER_STATE.STOPPING
        ) {
            return this.stopPromise;
        }
        this.stopping =
            true;
        this.state =
            MANAGER_STATE.STOPPING;
        this.emit(
            'stopping'
        );
        this.stopPromise =
            this.#stopInternal();
        try {
            await this.stopPromise;
        } finally {
            this.stopPromise =
                null;
        }
    }
    async #stopInternal() {
        this.#clearReconnectTimer();
        if (this.accessDeniedTimer) {
            clearTimeout(this.accessDeniedTimer);
            this.accessDeniedTimer = null;
        }
        this.accessDeniedUntil = null;
        if (
            this.startDelayTimer
        ) {
            clearTimeout(
                this.startDelayTimer
            );
            this.startDelayTimer =
                null;
        }
        const stream =
            this.currentStream;
        this.currentStream =
            null;
        if (
            stream
        ) {
            try {
                await stream.close(
                    1000,
                    'Manager shutdown.'
                );
            } catch (error) {
                this.#recordError(
                    error
                );
                try {
                    stream.terminate();
                } catch {
                    // Ignore termination errors.
                }
            }
            this.#unbindStream(
                stream
            );
        }
        this.state =
            MANAGER_STATE.STOPPED;
        this.emit(
            'stopped'
        );
    }
    async restart() {
        await this.stop();
        this.stopping =
            false;
        this.reconnectAttempts =
            0;
        this.state =
            MANAGER_STATE.IDLE;
        await this.start();
    }
    #recordError(
        error
    ) {
        const normalized =
            error instanceof Error
                ? error
                : new Error(
                    String(error)
                );
        this.totalErrors++;
        this.lastError = {
            message:
                normalized.message,
            name:
                normalized.name,
            code:
                normalized.code ??
                null,
            at:
                Date.now()
        };
        return normalized;
    }
    #clearReconnectTimer() {
        if (
            this.reconnectTimer
        ) {
            clearTimeout(
                this.reconnectTimer
            );
            this.reconnectTimer =
                null;
        }
    }
}
module.exports = {
    WebSocketManager,
    MANAGER_STATE
};
