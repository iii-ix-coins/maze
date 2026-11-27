'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    BOOTSTRAP_ELEMENT_ID,
    createSnapshot,
    injectIdentityBootstrap,
    serializeForInlineJson,
} = require('../../shared/identity/identity-bootstrap');

const html = '<!doctype html><html><head><title>x</title></head><body></body></html>';

function extract(document) {
    const match = document.match(new RegExp(`<script id="${BOOTSTRAP_ELEMENT_ID}" type="application/json">([\\s\\S]*?)</script>`));
    return match ? JSON.parse(match[1]) : null;
}

test('anonymous and authenticated snapshots round-trip through the document', () => {
    const user = { id: 'u1', username: 'neo', avatarUrl: null, walletAddress: 'Wallet1111' };
    assert.deepEqual(extract(injectIdentityBootstrap(html, createSnapshot(user))), { v: 1, authenticated: true, user });
    assert.deepEqual(extract(injectIdentityBootstrap(html, createSnapshot(null))), { v: 1, authenticated: false, user: null });
});

test('the snapshot is placed inside <head> before the closing tag', () => {
    const out = injectIdentityBootstrap(html, createSnapshot(null));
    assert.ok(out.indexOf(BOOTSTRAP_ELEMENT_ID) < out.indexOf('</head>'));
});

test('user-controlled text cannot break out of the script element', () => {
    const hostile = '</script><script>alert(1)</script> $& $1 \u2028';
    const out = injectIdentityBootstrap(html, createSnapshot({ id: 'u', username: hostile, avatarUrl: null, walletAddress: 'W' }));
    assert.equal((out.match(/<\/script>/g) || []).length, 1);
    assert.equal(extract(out).user.username, hostile);
    assert.ok(!serializeForInlineJson({ a: '<' }).includes('<'));
});
