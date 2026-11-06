'use strict';

const {
    config
} = require('../engines/interaction-engine/config');

const {
    normalizeError
} = require('../engines/interaction-engine/lib/utils');

const ALLOWED_ACTIONS =
    new Set([
        'view',
        'like',
        'share'
    ]);

async function sendInteraction(action) {
    if (
        typeof action !== 'string' ||
        !ALLOWED_ACTIONS.has(action)
    ) {
        throw new TypeError(
            `Invalid interaction action: ${action}`
        );
    }

    const controller =
        new AbortController();

    const timeoutMs =
        config.requestTimeoutMs;

    let timedOut = false;

    const timeout =
        setTimeout(
            () => {
                timedOut = true;
                controller.abort();
            },
            timeoutMs
        );

    try {
        const url =
            `http://${config.host}:${config.port}/internal/interactions`;

        let response;

        try {
            response =
                await fetch(
                    url,
                    {
                        method: 'POST',

                        headers: {
                            'Content-Type':
                                'application/json',

                            'Accept':
                                'application/json',

                            'Authorization':
                                `Bearer ${config.internalToken}`
                        },

                        body:
                            JSON.stringify({
                                action
                            }),

                        signal:
                            controller.signal
                    }
                );

        } catch (error) {
            const normalized =
                normalizeError(
                    error
                );

            if (
                timedOut ||
                normalized.name ===
                'AbortError'
            ) {
                const timeoutError =
                    new Error(
                        `Interaction engine request timed out after ${timeoutMs}ms.`
                    );

                timeoutError.code =
                    'INTERACTION_TIMEOUT';

                timeoutError.cause =
                    normalized;

                throw timeoutError;
            }

            throw normalized;
        }

        let data = null;

        const contentType =
            (
                response.headers.get(
                    'content-type'
                ) || ''
            ).toLowerCase();

        if (
            contentType.includes(
                'application/json'
            )
        ) {
            try {
                data =
                    await response.json();
            } catch (error) {
                const normalized =
                    normalizeError(
                        error
                    );

                const parseError =
                    new Error(
                        'Interaction engine returned invalid JSON.'
                    );

                parseError.code =
                    'INTERACTION_INVALID_JSON';

                parseError.cause =
                    normalized;

                throw parseError;
            }
        } else {
            const text =
                await response.text();

            if (
                text.trim() !== ''
            ) {
                data = {
                    raw: text
                };
            }
        }

        if (
            !response.ok
        ) {
            const message =
                typeof data?.error === 'string' &&
                    data.error.trim() !== ''
                    ? data.error
                    : `Interaction engine returned HTTP ${response.status}.`;

            const httpError =
                new Error(
                    message
                );

            httpError.code =
                'INTERACTION_HTTP_ERROR';

            httpError.status =
                response.status;

            httpError.response =
                data;

            throw httpError;
        }

        return {
            accepted:
                data?.accepted === true,

            action:
                typeof data?.action === 'string'
                    ? data.action
                    : action,

            stats:
                data?.stats || null
        };

    } finally {
        clearTimeout(
            timeout
        );
    }
}

module.exports = {
    sendInteraction
};