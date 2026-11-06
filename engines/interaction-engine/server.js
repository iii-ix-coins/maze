'use strict';

const express = require('express');

const {
    config
} = require('./config');

const ALLOWED_ACTIONS =
    new Set([
        'view',
        'like',
        'share'
    ]);

function createInteractionServer({
    db,
    publishState
}) {
    if (!db) {
        throw new Error(
            'Interaction database is required.'
        );
    }

    if (
        typeof publishState !== 'function'
    ) {
        throw new TypeError(
            'publishState must be a function.'
        );
    }

    const app =
        express();

    app.disable(
        'x-powered-by'
    );

    app.use(
        express.json({
            limit: '16kb'
        })
    );

    /*
     * Internal authentication.
     *
     * Only the Web process should
     * be allowed to mutate interaction data.
     */
    app.use(
        (req, res, next) => {

            const authorization =
                req.get(
                    'authorization'
                ) || '';

            const expected =
                `Bearer ${config.internalToken}`;

            if (
                authorization !== expected
            ) {
                return res.status(401).json({
                    accepted: false,
                    error:
                        'Unauthorized.'
                });
            }

            next();
        }
    );

    app.get(
        '/health',
        (req, res) => {

            return res.json({
                ok: true,
                service:
                    'interaction-engine'
            });
        }
    );

    app.post(
        '/internal/interactions',
        (req, res) => {

            const action =
                typeof req.body?.action === 'string'
                    ? req.body.action.trim()
                    : '';

            if (
                !ALLOWED_ACTIONS.has(
                    action
                )
            ) {
                return res.status(400).json({
                    accepted: false,
                    error:
                        'Invalid interaction action.'
                });
            }

            try {

                const stats =
                    db.recordInteraction(
                        action
                    );

                publishState();

                return res.status(200).json({
                    accepted: true,
                    action,
                    stats
                });

            } catch (error) {

                console.error(
                    '[Interaction Engine] Interaction write failed:',
                    error?.message ||
                    error
                );

                return res.status(500).json({
                    accepted: false,
                    error:
                        'Interaction write failed.'
                });
            }
        }
    );

    return app;
}

module.exports = {
    createInteractionServer
};