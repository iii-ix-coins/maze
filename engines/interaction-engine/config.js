'use strict';

require('dotenv').config();

const config = Object.freeze({
    host:
        String(
            process.env.INTERACTION_HOST ||
            '127.0.0.1'
        ).trim(),

    port:
        Number(
            process.env.INTERACTION_PORT
        ) || 5101,

    internalToken:
        String(
            process.env.INTERACTION_INTERNAL_TOKEN ||
            ''
        ).trim(),

    eventRetentionDays:
        Math.max(
            1,
            Number(
                process.env.INTERACTION_EVENT_RETENTION_DAYS
            ) || 90
        ),

    cleanupIntervalMs:
        Math.max(
            60_000,
            Number(
                process.env.INTERACTION_CLEANUP_INTERVAL_MS
            ) || (
                60 * 60 * 1000
            )
        ),

    requestTimeoutMs:
        Math.max(
            1_000,
            Number(
                process.env.INTERACTION_REQUEST_TIMEOUT_MS
            ) || 5_000
        )
});

function validateConfig() {
    if (
        typeof config.host !== 'string' ||
        config.host.trim() === ''
    ) {
        throw new Error(
            'Invalid INTERACTION_HOST.'
        );
    }

    if (
        !Number.isInteger(config.port) ||
        config.port < 1 ||
        config.port > 65535
    ) {
        throw new Error(
            'Invalid INTERACTION_PORT.'
        );
    }

    if (
        config.internalToken.length < 16
    ) {
        throw new Error(
            'INTERACTION_INTERNAL_TOKEN must be at least 16 characters.'
        );
    }

    if (
        !Number.isInteger(
            config.eventRetentionDays
        ) ||
        config.eventRetentionDays < 1
    ) {
        throw new Error(
            'Invalid INTERACTION_EVENT_RETENTION_DAYS.'
        );
    }

    if (
        !Number.isInteger(
            config.cleanupIntervalMs
        ) ||
        config.cleanupIntervalMs < 60_000
    ) {
        throw new Error(
            'Invalid INTERACTION_CLEANUP_INTERVAL_MS.'
        );
    }

    if (
        !Number.isInteger(
            config.requestTimeoutMs
        ) ||
        config.requestTimeoutMs < 1_000
    ) {
        throw new Error(
            'Invalid INTERACTION_REQUEST_TIMEOUT_MS.'
        );
    }

    return config;
}

module.exports = {
    config,
    validateConfig
};