'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

require('dotenv').config();


const {
    sendInteraction
} = require('./shared/interactionClient');

const {
    getInteractionState
} = require('./shared/state/interactionState');

const {
    getHolderState
} = require('./shared/state/holderState');

const {
    getPriceStateJson
} = require('./shared/state/priceState');

const {
    getTxState
} = require('./shared/state/txState');

const {
    getJupiterMarketState,
    getJupiterMarketStateJson
} = require(
    './shared/state/jupiterMarketState'
);

const JupiterMarketReadService =
    require(
        './shared/services/JupiterMarketReadService'
    );

const jupiterMarketReadService =
    new JupiterMarketReadService();

function sanitizeJupiterMarketState(state) {
    if (!state || typeof state !== 'object') {
        return state;
    }

    const result = { ...state };
    if (result.data && typeof result.data === 'object') {
        result.data = { ...result.data };
        delete result.data.raw;
    }
    return result;
}

const {
    getLatestPurchases,
    getTopHolders
} = require('./shared/services/LiveFeedService');

const app =
    express();

// Small shared cache window reduces duplicate polling bursts without hiding fresh feed updates.
function shortApiCache(req, res, next) {
    res.setHeader('Cache-Control', 'public, max-age=2, stale-while-revalidate=10');
    next();
}


const PORT =
    Number(
        process.env.PORT
    ) || 5000;

const HOST =
    process.env.HOST ||
    '0.0.0.0';

app.disable(
    'x-powered-by'
);

app.use(
    express.json({
        limit: '16kb'
    })
);

// Lightweight native gzip for sizeable JSON/text API responses (no extra runtime dependency).
app.use((req, res, next) => {
    if (!/\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) return next();
    res.vary('Accept-Encoding');
    const send = res.send;
    res.send = function compressedSend(body) {
        const type = String(res.getHeader('Content-Type') || '');
        const size = Buffer.isBuffer(body) ? body.length : typeof body === 'string' ? Buffer.byteLength(body) : 0;
        if (size < 1024 || (!type.includes('json') && !type.startsWith('text/')) || res.getHeader('Content-Encoding')) {
            return send.call(this, body);
        }
        const source = Buffer.isBuffer(body) ? body : Buffer.from(body);
        const compressed = zlib.gzipSync(source, { level: zlib.constants.Z_BEST_SPEED });
        res.setHeader('Content-Encoding', 'gzip');
        res.removeHeader('Content-Length');
        return send.call(this, compressed);
    };
    next();
});

const PUBLIC_DIR = path.join(__dirname, 'public');
const SITE_DIST_DIR = path.join(__dirname, 'dist', 'site');
const SITE_DIST_INDEX = path.join(SITE_DIST_DIR, 'index.html');
const LEGACY_SITE_INDEX = path.join(__dirname, 'legacy', 'home.html');
const LEGACY_MAZE_INDEX = path.join(__dirname, 'legacy', 'maze.html');

// Both `/` and `/maze.html` are routes in the same root React/Vite application.
// The old standalone documents remain available only as explicit rollback URLs.
app.get('/maze.html', (req, res) => {
    const page = fs.existsSync(SITE_DIST_INDEX) ? SITE_DIST_INDEX : LEGACY_MAZE_INDEX;
    return res.sendFile(page);
});

app.get('/maze-legacy.html', (req, res) => res.sendFile(LEGACY_MAZE_INDEX));

// Public assets retain their old stable URLs (/css, /js and /maze-assets).
// `index: false` prevents Express from serving a legacy HTML document at `/`.
app.use(
    express.static(PUBLIC_DIR, {
        index: false,
        maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
        etag: true
    })
);

// Vite's fingerprinted production assets live here. The public directory is
// intentionally mounted first so unchanged legacy paths continue to resolve.
app.use(
    express.static(SITE_DIST_DIR, {
        index: false,
        maxAge: process.env.NODE_ENV === 'production' ? '1y' : 0,
        immutable: process.env.NODE_ENV === 'production',
        etag: true
    })
);

/*
 * --------------------------------------------------
 * Health
 * --------------------------------------------------
 */

app.get(
    '/health',
    (req, res) => {
        return res.json({
            ok: true,
            service: 'web'
        });
    }
);

/*
 * --------------------------------------------------
 * Public configuration
 * --------------------------------------------------
 */

app.get(
    '/api/config',
    (req, res) => {

        return res.json({
            mintAddress:
                process.env.MINT_ADDRESS ||
                ''
        });
    }
);

app.get(
    '/api/coin-age',
    (req, res) => {

        return res.json({
            launchDate:
                process.env.COIN_LAUNCH_DATE ||
                ''
        });
    }
);

/*
 * --------------------------------------------------
 * Price API
 * --------------------------------------------------
 */

app.get(
    '/api/live-price',
    (req, res) => {

        const jsonStr =
            getPriceStateJson();

        if (jsonStr) {

            res.setHeader(
                'Content-Type',
                'application/json'
            );

            return res.send(
                jsonStr
            );
        }

        return res.status(503).json({
            error:
                'Price engine is warming up. Please wait...'
        });
    }
);

/*
 * --------------------------------------------------
 * Jupiter Market Data API
 * --------------------------------------------------
 */

app.get(
    '/api/jupiter-market',
    (req, res) => {

        try {

            const state =
                getJupiterMarketState();

            if (!state) {

                return res.status(503).json({
                    ok: false,
                    error:
                        'Jupiter market data is warming up.'
                });
            }

            res.setHeader(
                'Cache-Control',
                'no-store'
            );

            return res.json(
                sanitizeJupiterMarketState(state)
            );

        } catch (error) {

            console.error(
                '[Web] Jupiter market API failed:',
                error?.message || error
            );

            return res.status(503).json({
                ok: false,
                error:
                    'Jupiter market data is temporarily unavailable.'
            });
        }
    }
);

app.get(
    '/api/jupiter-market/raw',
    (req, res) => {
        if (process.env.NODE_ENV === 'production') {
            return res.status(404).json({
                ok: false,
                error: 'Not found'
            });
        }

        const json = getJupiterMarketStateJson();

        if (!json) {
            return res.status(503).json({
                ok: false,
                error: 'Jupiter market data is warming up.'
            });
        }

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        return res.send(json);
    }
);

app.get(
    '/api/jupiter-market/history',
    (req, res) => {

        try {

            const mintAddress =
                String(
                    req.query.mint ||
                    process.env.JUPITER_MARKET_MINT ||
                    process.env.MINT_ADDRESS ||
                    ''
                ).trim();

            if (!mintAddress) {
                return res.status(400).json({
                    ok: false,

                    error:
                        'Mint address is required.'
                });
            }

            const data =
                jupiterMarketReadService
                    .getHistory(
                        mintAddress,
                        req.query.limit
                    );

            if (data === null) {
                return res.status(503).json({
                    ok: false,

                    error:
                        'Jupiter market history is not available yet.'
                });
            }

            res.setHeader(
                'Cache-Control',
                'no-store'
            );

            return res.json({
                ok: true,

                source:
                    'jupiter-market',

                mintAddress,

                items:
                    data
            });

        } catch (error) {

            console.error(
                '[Web] Jupiter market history failed:',
                error?.message || error
            );

            return res.status(503).json({
                ok: false,

                error:
                    'Jupiter market history is temporarily unavailable.'
            });
        }
    }
);

/*
 * --------------------------------------------------
 * Live Feed API
 * --------------------------------------------------
 */

app.get(
    '/api/live-feed/buyers',
    shortApiCache,
    (req, res) => {

        try {

            const data =
                getLatestPurchases({
                    limit: req.query.limit
                });

            return res.json(
                data
            );

        } catch (error) {

            console.error(
                '[Web] Live buyers feed failed:',
                error?.message || error
            );

            return res.status(503).json({
                error:
                    'Live buyers data is temporarily unavailable.'
            });
        }
    }
);

app.get(
    '/api/live-feed/holders',
    shortApiCache,
    (req, res) => {

        try {

            const data =
                getTopHolders({
                    limit: req.query.limit
                });

            if (!data) {
                return res.status(503).json({
                    error:
                        'Holder engine is warming up.'
                });
            }

            return res.json(
                data
            );

        } catch (error) {

            console.error(
                '[Web] Top holders feed failed:',
                error?.message || error
            );

            return res.status(503).json({
                error:
                    'Top holders data is temporarily unavailable.'
            });
        }
    }
);
/*
 * --------------------------------------------------
 * Interaction API
 * --------------------------------------------------
 */

app.get(
    '/api/stats',
    shortApiCache,
    (req, res) => {

        const state =
            getInteractionState();

        if (
            state &&
            state.stats
        ) {

            return res.json(
                state.stats
            );
        }

        return res.status(503).json({
            error:
                'Interaction engine is warming up.'
        });
    }
);

async function handleInteraction(
    action,
    req,
    res
) {
    try {

        const result =
            await sendInteraction(
                action
            );

        return res.status(200).json({
            accepted: true,

            action,

            stats:
                result?.stats ||
                null
        });

    } catch (error) {

        console.warn(
            `[Web] Interaction "${action}" failed:`,
            error?.message ||
            error
        );

        return res.status(503).json({
            accepted: false,

            error:
                'Interaction engine is temporarily unavailable.'
        });
    }
}

app.post(
    '/api/stats/view',
    (req, res) =>
        handleInteraction(
            'view',
            req,
            res
        )
);

app.post(
    '/api/stats/like',
    (req, res) =>
        handleInteraction(
            'like',
            req,
            res
        )
);

app.post(
    '/api/stats/share',
    (req, res) =>
        handleInteraction(
            'share',
            req,
            res
        )
);

/*
 * --------------------------------------------------
 * Holder API
 * --------------------------------------------------
 */

app.get(
    '/api/holders-summary',
    shortApiCache,
    (req, res) => {

        const state =
            getHolderState();

        if (
            state &&
            state.data
        ) {

            return res.json(
                state.data
            );
        }

        return res.status(503).json({
            error:
                'Scanning blockchain for holders. Please wait...'
        });
    }
);

/*
 * --------------------------------------------------
 * Transaction / Buyers API
 * --------------------------------------------------
 */

app.get(
    '/api/latest-buyers',
    shortApiCache,
    (req, res) => {

        const state =
            getTxState();

        if (
            state &&
            Array.isArray(
                state.latestBuyers
            )
        ) {

            return res.json(
                state.latestBuyers
            );
        }

        return res.status(503).json({
            error:
                'Transaction engine is warming up. Please wait...'
        });
    }
);

app.get(
    '/api/tx-state',
    shortApiCache,
    (req, res) => {

        const state =
            getTxState();

        if (
            state &&
            state.state
        ) {

            return res.json(
                state.state
            );
        }

        return res.json({
            status: 'loading'
        });
    }
);

/*
 * --------------------------------------------------
 * Frontend
 * --------------------------------------------------
 */

// Client routes must resolve to the shared Vite document on direct visits and refreshes.
app.get(['/token', '/holders', '/market', '/coin.html', '/holders.html', '/market.html'], (req, res, next) => {
    if (fs.existsSync(SITE_DIST_INDEX)) return res.sendFile(SITE_DIST_INDEX);
    return next();
});


app.get(
    '/',
    (req, res) => {
        // Use the single root Vite/React build when present. If it has not been built yet,
        // fall back to the untouched legacy Home document so deployment is reversible.
        const indexFile = fs.existsSync(SITE_DIST_INDEX)
            ? SITE_DIST_INDEX
            : LEGACY_SITE_INDEX;

        return res.sendFile(indexFile);
    }
);

app.get(
    '/legacy',
    (req, res) => res.sendFile(LEGACY_SITE_INDEX)
);

/*
 * --------------------------------------------------
 * 404
 * --------------------------------------------------
 */

app.use(
    (req, res) => {

        return res.status(404).json({
            error:
                'Not found'
        });
    }
);

/*
 * --------------------------------------------------
 * Error handler
 * --------------------------------------------------
 */

app.use(
    (error, req, res, next) => {

        console.error(
            '[Web] Unhandled request error:',
            error?.message ||
            error
        );

        if (
            res.headersSent
        ) {
            return next(error);
        }

        return res.status(500).json({
            error:
                'Internal server error.'
        });
    }
);

/*
 * --------------------------------------------------
 * Server
 * --------------------------------------------------
 */

const server =
    app.listen(
        PORT,
        HOST,
        () => {

            console.log(
                `🌐 Website is running on http://${HOST}:${PORT}`
            );
        }
    );

function shutdown(signal) {

    console.log(
        `[Web] Received ${signal}. Shutting down HTTP server...`
    );

    try {
        jupiterMarketReadService.close();
    } catch (error) {
        console.warn(
            '[Web] Failed to close Jupiter Market read service:',
            error?.message || error
        );
    }

    server.close(
        () => {

            console.log(
                '[Web] HTTP server stopped.'
            );

            process.exit(0);
        }
    );

    setTimeout(
        () => {

            console.error(
                '[Web] Forced shutdown.'
            );

            process.exit(1);

        },
        10000
    ).unref();
}

process.on(
    'SIGINT',
    () => shutdown('SIGINT')
);

process.on(
    'SIGTERM',
    () => shutdown('SIGTERM')
);
