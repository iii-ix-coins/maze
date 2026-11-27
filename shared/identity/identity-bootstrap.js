'use strict';

/**
 * Server-side identity bootstrap.
 *
 * The HTML document is the first thing a browser receives, and the server can
 * already read the session cookie while serving it. Embedding the (public)
 * session snapshot in that document lets the client render the correct
 * authenticated / anonymous surface on its very first paint, so a signed-in
 * visitor never sees the guest Gate while `/api/auth/session` is in flight.
 *
 * The snapshot is exactly the payload `GET /api/auth/session` returns to the
 * same cookie owner. The client still revalidates it in the background.
 */

const BOOTSTRAP_ELEMENT_ID = 'identity-bootstrap';
const BOOTSTRAP_VERSION = 1;

/** JSON that is safe inside an inline <script type="application/json"> element. */
function serializeForInlineJson(value) {
    return JSON.stringify(value)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

function createSnapshot(user) {
    return user
        ? { v: BOOTSTRAP_VERSION, authenticated: true, user }
        : { v: BOOTSTRAP_VERSION, authenticated: false, user: null };
}

function injectIdentityBootstrap(html, snapshot) {
    const tag = `<script id="${BOOTSTRAP_ELEMENT_ID}" type="application/json">${serializeForInlineJson(snapshot)}</script>`;
    // Function replacers: user-controlled text must never be read as `$&` / `$1` patterns.
    if (html.includes('</head>')) return html.replace('</head>', () => `${tag}\n</head>`);
    return `${tag}\n${html}`;
}

module.exports = {
    BOOTSTRAP_ELEMENT_ID,
    BOOTSTRAP_VERSION,
    createSnapshot,
    injectIdentityBootstrap,
    serializeForInlineJson,
};
