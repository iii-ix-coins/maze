'use strict';
const EventEmitter = require('events');
const WebSocket = require('ws');
const {
    buildHollldTransactionSubscription,
    serializeSubscription
} = require('./SubscriptionBuilder');
const DEFAULT_WS_ENDPOINT =
    'wss://atlas-mainnet.helius-rpc.com/';
const DEFAULT_CONNECT_TIMEOUT_MS =
    10_000;
const DEFAULT_HEARTBEAT_INTERVAL_MS =
    20_000;
const DEFAULT_INACTIVITY_TIMEOUT_MS =
    90_000;
const DEFAULT_CLOSE_TIMEOUT_MS =
    5_000;
const DEFAULT_MAX_MESSAGE_BYTES =
    20 * 1024 * 1024;
const STATE = Object.freeze({
    IDLE: 'idle',
    CONNECTING: 'connecting',
    OPEN: 'open',
    CLOSING: 'closing',
    CLOSED: 'closed'
});
class HeliusTransactionStream extends EventEmitter {
    constructor({
        apiKey,
        wsUrl = DEFAULT_WS_ENDPOINT,
        mintAddress,
        commitment = 'confirmed',
        subscriptionId = 1,
        connectTimeoutMs =
        DEFAULT_CONNECT_TIMEOUT_MS,
        heartbeatIntervalMs =
        DEFAULT_HEARTBEAT_INTERVAL_MS,
        inactivityTimeoutMs =
        DEFAULT_INACTIVITY_TIMEOUT_MS,
        closeTimeoutMs =
        DEFAULT_CLOSE_TIMEOUT_MS,
        maxMessageBytes =
        DEFAULT_MAX_MESSAGE_BYTES,
        maxSupportedTransactionVersion = 1
    } = {}) {
        super();
        if (
            typeof apiKey !== 'string' ||
            apiKey.trim() === ''
        ) {
            throw new TypeError(
                'Helius API key is required.'
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
        if (
            !Number.isInteger(
                connectTimeoutMs
            ) ||
            connectTimeoutMs <= 0
        ) {
            throw new TypeError(
                'connectTimeoutMs must be a positive integer.'
            );
        }
        if (
            !Number.isInteger(
                heartbeatIntervalMs
            ) ||
            heartbeatIntervalMs <= 0
        ) {
            throw new TypeError(
                'heartbeatIntervalMs must be a positive integer.'
            );
        }
        if (
            !Number.isInteger(
                inactivityTimeoutMs
            ) ||
            inactivityTimeoutMs <=
            heartbeatIntervalMs
        ) {
            throw new TypeError(
                'inactivityTimeoutMs must be greater than heartbeatIntervalMs.'
            );
        }
        if (
            !Number.isInteger(
                closeTimeoutMs
            ) ||
            closeTimeoutMs <= 0
        ) {
            throw new TypeError(
                'closeTimeoutMs must be a positive integer.'
            );
        }

        if (
            !Number.isInteger(
                maxMessageBytes
            ) ||
            maxMessageBytes <= 0
        ) {
            throw new TypeError(
                'maxMessageBytes must be a positive integer.'
            );
        }
        this.apiKey =
            apiKey.trim();
        this.wsUrl =
            wsUrl instanceof URL
                ? wsUrl.toString()
                : String(wsUrl).trim();
        if (!this.wsUrl) {
            throw new TypeError(
                'wsUrl is required.'
            );
        }
        this.mintAddress =
            mintAddress.trim();
        this.commitment =
            commitment;
        this.subscriptionId =
            Number.isSafeInteger(
                subscriptionId
            ) &&
                subscriptionId > 0
                ? subscriptionId
                : 1;
        this.connectTimeoutMs =
            connectTimeoutMs;
        this.heartbeatIntervalMs =
            heartbeatIntervalMs;
        this.inactivityTimeoutMs =
            inactivityTimeoutMs;
        this.closeTimeoutMs =
            closeTimeoutMs;
        this.maxMessageBytes =
            maxMessageBytes;
        this.maxSupportedTransactionVersion =
            Number.isSafeInteger(maxSupportedTransactionVersion) &&
            maxSupportedTransactionVersion >= 1
                ? maxSupportedTransactionVersion
                : 1;
        this.ws = null;
        this.state =
            STATE.IDLE;
        this.subscriptionIdRemote =
            null;
        this.connectTimer =
            null;
        this.heartbeatTimer =
            null;
        this.inactivityTimer =
            null;
        this.closeTimer =
            null;
        this.lastMessageAt =
            0;
        this.lastPingAt =
            0;
        this.lastPongAt =
            0;
        this._connectPromise =
            null;
        this._closePromise =
            null;
        this._manualClose =
            false;
        this._messageCounter =
            0;
        this._notificationCounter =
            0;
        this._errorCounter =
            0;
    }
    getState() {
        return this.state;
    }
    isOpen() {
        return (
            this.state === STATE.OPEN &&
            this.ws &&
            this.ws.readyState === WebSocket.OPEN
        );
    }
    isClosed() {
        return (
            this.state === STATE.CLOSED ||
            this.state === STATE.IDLE
        );
    }
    getStats() {
        return {
            state:
                this.state,
            connected:
                this.isOpen(),
            subscriptionId:
                this.subscriptionIdRemote,
            lastMessageAt:
                this.lastMessageAt || null,
            lastPingAt:
                this.lastPingAt || null,
            lastPongAt:
                this.lastPongAt || null,
            messages:
                this._messageCounter,
            notifications:
                this._notificationCounter,
            errors:
                this._errorCounter,
            manualClose:
                this._manualClose
        };
    }
    buildSubscriptionRequest() {
        return buildHollldTransactionSubscription({
            mintAddress:
                this.mintAddress,
            id:
                this.subscriptionId,
            commitment:
                this.commitment,
            maxSupportedTransactionVersion:
                this.maxSupportedTransactionVersion
        });
    }
    buildWebSocketUrl() {
        const url =
            new URL(
                this.wsUrl
            );
        url.searchParams.set(
            'api-key',
            this.apiKey
        );
        return url.toString();
    }
    sanitizeUrlForLog() {
        try {
            const url =
                new URL(
                    this.wsUrl
                );
            url.searchParams.delete(
                'api-key'
            );
            return url.toString();
        } catch {
            return '<invalid-websocket-url>';
        }
    }
    async connect() {
        if (
            this.isOpen()
        ) {
            return;
        }
        if (
            this._connectPromise
        ) {
            return this._connectPromise;
        }
        this._manualClose =
            false;
        this.state =
            STATE.CONNECTING;
        this.emit(
            'connecting'
        );
        this._connectPromise =
            this._openSocket();
        try {
            await this._connectPromise;
        } finally {
            this._connectPromise =
                null;
        }
    }
    async _openSocket() {
        const url =
            this.buildWebSocketUrl();
        const socket =
            new WebSocket(
                url,
                {
                    maxPayload:
                        this.maxMessageBytes,
                    perMessageDeflate:
                        false
                }
            );
        this.ws =
            socket;
        return new Promise(
            (resolve, reject) => {
                let settled =
                    false;
                const settleResolve =
                    () => {
                        if (settled) {
                            return;
                        }
                        settled =
                            true;
                        this._clearConnectTimer();
                        resolve();
                    };
                const settleReject =
                    error => {
                        if (settled) {
                            return;
                        }
                        settled =
                            true;
                        this._clearConnectTimer();
                        reject(error);
                    };
                this.connectTimer =
                    setTimeout(
                        () => {
                            const error =
                                new Error(
                                    `Helius WebSocket connection timed out after ${this.connectTimeoutMs}ms.`
                                );
                            this._emitError(
                                error
                            );
                            try {
                                socket.terminate();
                            } catch {
                                // Ignore terminate errors.
                            }
                            settleReject(
                                error
                            );
                        },
                        this.connectTimeoutMs
                    );
                socket.once(
                    'open',
                    () => {
                        try {
                            this.state =
                                STATE.OPEN;
                            this.lastMessageAt =
                                Date.now();
                            this.lastPongAt =
                                Date.now();
                            this._startHeartbeat();
                            this._startInactivityWatchdog();
                            this._sendSubscription();
                            this.emit(
                                'open',
                                {
                                    url:
                                        this.sanitizeUrlForLog()
                                }
                            );
                            settleResolve();
                        } catch (error) {
                            this._emitError(
                                error
                            );
                            try {
                                socket.terminate();
                            } catch {
                                // Ignore.
                            }
                            settleReject(
                                error
                            );
                        }
                    }
                );
                socket.on(
                    'message',
                    data =>
                        this._handleMessage(
                            data
                        )
                );
                socket.on(
                    'pong',
                    () => {
                        this.lastPongAt =
                            Date.now();
                        this.emit(
                            'pong',
                            {
                                at:
                                    this.lastPongAt
                            }
                        );
                    }
                );
                socket.on(
                    'ping',
                    () => {
                        this.emit(
                            'ping',
                            {
                                at:
                                    Date.now()
                            }
                        );
                    }
                );
                socket.on(
                    'error',
                    error => {
                        this._emitError(
                            error
                        );
                        if (
                            this.state ===
                            STATE.CONNECTING
                        ) {
                            settleReject(
                                error
                            );
                        }
                    }
                );
                socket.on(
                    'unexpected-response',
                    (request, response) => {
                        const statusCode = Number(response?.statusCode);
                        const error = new Error(
                            `Helius WebSocket handshake failed: HTTP ${statusCode || 'unknown'}`
                        );
                        error.code = Number.isInteger(statusCode)
                            ? `WS_HTTP_${statusCode}`
                            : 'WS_UNEXPECTED_RESPONSE';
                        error.statusCode = Number.isInteger(statusCode)
                            ? statusCode
                            : null;
                        try {
                            response?.resume?.();
                        } catch {
                            // Ignore response-drain errors.
                        }
                        this._emitError(error);
                        if (this.state === STATE.CONNECTING) {
                            settleReject(error);
                        }
                    }
                );
                socket.on(
                    'close',
                    (
                        code,
                        reason
                    ) => {
                        const reasonText =
                            Buffer
                                .from(
                                    reason || ''
                                )
                                .toString(
                                    'utf8'
                                );
                        this._handleClose(
                            code,
                            reasonText
                        );
                        if (
                            this.state ===
                            STATE.CONNECTING
                        ) {
                            settleReject(
                                new Error(
                                    `Helius WebSocket closed before connection was established. code=${code} reason=${reasonText || 'none'}`
                                )
                            );
                        }
                    }
                );
            }
        );
    }
    _sendSubscription() {
        if (
            !this.ws ||
            this.ws.readyState !==
            WebSocket.OPEN
        ) {
            throw new Error(
                'Cannot subscribe: WebSocket is not open.'
            );
        }
        const request =
            this.buildSubscriptionRequest();
        const payload =
            serializeSubscription(
                request
            );
        this.ws.send(
            payload
        );
        this.emit(
            'subscriptionRequest',
            {
                request
            }
        );
    }
    _handleMessage(
        data
    ) {
        this.lastMessageAt =
            Date.now();
        this._messageCounter++;
        let message;
        try {
            if (
                Buffer.isBuffer(data)
            ) {
                message =
                    JSON.parse(
                        data.toString(
                            'utf8'
                        )
                    );
            } else {
                message =
                    JSON.parse(
                        String(data)
                    );
            }
        } catch (error) {
            this._errorCounter++;
            const parseError =
                new Error(
                    'Invalid JSON received from Helius WebSocket.'
                );
            parseError.cause =
                error;
            this._emitError(
                parseError
            );
            return;
        }
        if (
            !message ||
            typeof message !== 'object'
        ) {
            return;
        }
        if (
            message.error
        ) {
            const error =
                this._createRpcError(
                    message.error
                );
            if (
                message.id ===
                this.subscriptionId
            ) {
                this.emit(
                    'subscriptionError',
                    {
                        error,
                        message
                    }
                );
            }
            this._emitError(
                error
            );
            return;
        }
        if (
            message.id ===
            this.subscriptionId &&
            Object.prototype.hasOwnProperty.call(
                message,
                'result'
            )
        ) {
            this.subscriptionIdRemote =
                message.result;
            this.emit(
                'subscribed',
                {
                    subscriptionId:
                        message.result,
                    requestId:
                        message.id
                }
            );
            return;
        }
        if (
            message.method ===
            'transactionNotification'
        ) {
            this._notificationCounter++;
            const notification =
                this._normalizeNotification(
                    message
                );
            if (
                notification
            ) {
                this.emit(
                    'transaction',
                    notification
                );
            }
            return;
        }
        this.emit(
            'message',
            message
        );
    }
    _normalizeNotification(
        message
    ) {
        const params =
            message?.params;
        if (
            !params ||
            typeof params !== 'object'
        ) {
            return null;
        }
        const remoteSubscription =
            params.subscription ??
            null;
        const result =
            params.result ??
            null;
        if (
            !result ||
            typeof result !== 'object'
        ) {
            return null;
        }
        const signature =
            this._extractSignature(
                result
            );
        const slot =
            this._extractSlot(
                result
            );
        return {
            type:
                'transaction',
            method:
                message.method,
            subscriptionId:
                remoteSubscription,
            signature,
            slot,
            receivedAt:
                Date.now(),
            raw:
                result
        };
    }
    _extractSignature(
        result
    ) {
        const direct =
            result?.signature;
        if (
            typeof direct === 'string' &&
            direct.trim() !== ''
        ) {
            return direct.trim();
        }
        const nested =
            result?.transaction
                ?.signatures;
        if (
            Array.isArray(
                nested
            ) &&
            typeof nested[0] ===
            'string'
        ) {
            return nested[0];
        }
        const alternate =
            result?.signatures;
        if (
            Array.isArray(
                alternate
            ) &&
            typeof alternate[0] ===
            'string'
        ) {
            return alternate[0];
        }
        return null;
    }
    _extractSlot(
        result
    ) {
        const value =
            Number(
                result?.slot
            );
        return Number.isSafeInteger(
            value
        )
            ? value
            : null;
    }
    _createRpcError(
        rpcError
    ) {
        const message =
            typeof rpcError?.message ===
                'string'
                ? rpcError.message
                : 'Helius WebSocket JSON-RPC error.';
        const error =
            new Error(
                message
            );
        if (
            rpcError &&
            typeof rpcError === 'object'
        ) {
            if (
                'code' in rpcError
            ) {
                error.code =
                    rpcError.code;
            }
            if (
                'data' in rpcError
            ) {
                error.data =
                    rpcError.data;
            }
        }
        return error;
    }
    _startHeartbeat() {
        this._clearHeartbeat();
        this.heartbeatTimer =
            setInterval(
                () => {
                    if (
                        !this.isOpen()
                    ) {
                        return;
                    }
                    const now =
                        Date.now();
                    this.lastPingAt =
                        now;
                    try {
                        this.ws.ping();
                        this.emit(
                            'heartbeat',
                            {
                                at:
                                    now
                            }
                        );
                    } catch (error) {
                        this._emitError(
                            error
                        );
                    }
                },
                this.heartbeatIntervalMs
            );
    }
    _startInactivityWatchdog() {
        this._clearInactivityWatchdog();
        const check =
            () => {
                if (
                    !this.isOpen()
                ) {
                    return;
                }
                const now =
                    Date.now();
                const lastActivityAt =
                    Math.max(
                        this.lastMessageAt || 0,
                        this.lastPongAt || 0
                    );

                const elapsed =
                    lastActivityAt > 0
                        ? now - lastActivityAt
                        : 0;
                if (
                    elapsed >=
                    this.inactivityTimeoutMs
                ) {
                    const error =
                        new Error(
                            `Helius WebSocket inactivity timeout after ${elapsed}ms.`
                        );
                    this._emitError(
                        error
                    );
                    try {
                        this.ws.terminate();
                    } catch {
                        // Ignore termination errors.
                    }
                    return;
                }
                this.inactivityTimer =
                    setTimeout(
                        check,
                        Math.max(
                            this.heartbeatIntervalMs,
                            Math.floor(
                                this.inactivityTimeoutMs /
                                3
                            )
                        )
                    );
            };
        this.inactivityTimer =
            setTimeout(
                check,
                this.inactivityTimeoutMs
            );
    }
    async close(
        code = 1000,
        reason = 'Normal closure'
    ) {
        this._manualClose =
            true;
        if (
            this.state ===
            STATE.CLOSED
        ) {
            return;
        }
        if (
            !this.ws
        ) {
            this._cleanupTransport();
            this.state =
                STATE.CLOSED;
            return;
        }
        this.state =
            STATE.CLOSING;
        this.emit(
            'closing',
            {
                code,
                reason
            }
        );
        this._clearConnectTimer();
        this._clearHeartbeat();
        this._clearInactivityWatchdog();
        const socket =
            this.ws;
        this._closePromise =
            new Promise(
                resolve => {
                    let finished =
                        false;
                    const finish =
                        () => {
                            if (
                                finished
                            ) {
                                return;
                            }
                            finished =
                                true;
                            this._clearCloseTimer();
                            resolve();
                        };
                    socket.once(
                        'close',
                        finish
                    );
                    this.closeTimer =
                        setTimeout(
                            () => {
                                try {
                                    socket.terminate();
                                } catch {
                                    // Ignore termination errors.
                                }
                                finish();
                            },
                            this.closeTimeoutMs
                        );
                    try {
                        socket.close(
                            code,
                            reason
                        );
                    } catch {
                        try {
                            socket.terminate();
                        } catch {
                            // Ignore termination errors.
                        }

                        finish();
                    }
                }
            );
        await this._closePromise;
        this._closePromise =
            null;
        this._cleanupTransport();
        this.state =
            STATE.CLOSED;
        this.emit(
            'closed',
            {
                code,
                reason
            }
        );
    }
    terminate() {
        this._manualClose =
            true;
        this._clearConnectTimer();
        this._clearHeartbeat();
        this._clearInactivityWatchdog();
        this._clearCloseTimer();
        if (
            this.ws
        ) {
            try {
                this.ws.terminate();
            } catch {
                // Ignore termination errors.
            }
        }
        this._cleanupTransport();
        this.state =
            STATE.CLOSED;
        this.emit(
            'closed',
            {
                code:
                    1006,
                reason:
                    'Transport terminated.'
            }
        );
    }
    _handleClose(
        code,
        reason
    ) {
        this._clearConnectTimer();
        this._clearHeartbeat();
        this._clearInactivityWatchdog();
        this._clearCloseTimer();
        const previousState =
            this.state;
        this._cleanupTransport();
        this.subscriptionIdRemote =
            null;
        this.state =
            STATE.CLOSED;
        this.emit(
            'close',
            {
                code,
                reason,
                previousState,
                manual:
                    this._manualClose
            }
        );
    }
    _cleanupTransport() {
        this._clearConnectTimer();
        this._clearHeartbeat();
        this._clearInactivityWatchdog();
        this._clearCloseTimer();
        this.ws =
            null;
        this._closePromise =
            null;
    }
    _emitError(
        error
    ) {
        this._errorCounter++;
        const normalized =
            error instanceof Error
                ? error
                : new Error(
                    String(error)
                );
        this.emit(
            'error',
            normalized
        );
    }
    _clearConnectTimer() {
        if (
            this.connectTimer
        ) {
            clearTimeout(
                this.connectTimer
            );
            this.connectTimer =
                null;
        }
    }
    _clearHeartbeat() {
        if (
            this.heartbeatTimer
        ) {
            clearInterval(
                this.heartbeatTimer
            );
            this.heartbeatTimer =
                null;
        }
    }
    _clearInactivityWatchdog() {
        if (
            this.inactivityTimer
        ) {
            clearTimeout(
                this.inactivityTimer
            );
            this.inactivityTimer =
                null;
        }
    }
    _clearCloseTimer() {
        if (
            this.closeTimer
        ) {
            clearTimeout(
                this.closeTimer
            );
            this.closeTimer =
                null;
        }
    }
}
module.exports = {
    HeliusTransactionStream,
    STATE
};
