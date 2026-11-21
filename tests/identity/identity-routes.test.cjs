'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

// Set these before loading the module because the exact-origin allowlist is
// intentionally parsed once at process start, rather than on each request.
process.env.IDENTITY_ALLOWED_ORIGINS = 'https://maze.example,https://other.example';
process.env.IDENTITY_CHALLENGE_TTL_SECONDS = '300';
process.env.IDENTITY_SESSION_TTL_DAYS = '30';

const { IdentityStore } = require('../../shared/identity/identity-store');
const { createIdentityHandlers } = require('../../shared/identity/identity-routes');

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function encodeBase58(bytes) {
  let leadingZeroes = 0;
  while (leadingZeroes < bytes.length && bytes[leadingZeroes] === 0) leadingZeroes += 1;

  let value = BigInt(`0x${Buffer.from(bytes).toString('hex') || '0'}`);
  let encoded = '';
  while (value > 0n) {
    const remainder = Number(value % 58n);
    encoded = BASE58_ALPHABET[remainder] + encoded;
    value /= 58n;
  }
  return `${'1'.repeat(leadingZeroes)}${encoded}` || '1';
}

function createWallet() {
  const pair = crypto.generateKeyPairSync('ed25519');
  const publicKeyDer = pair.publicKey.export({ format: 'der', type: 'spki' });
  const address = encodeBase58(publicKeyDer.subarray(-32));
  return { ...pair, address };
}

function createRequest({ body = {}, origin = 'https://maze.example', cookie = '', ip = '127.0.0.1' } = {}) {
  const headers = {
    origin,
    cookie,
  };
  return {
    body,
    headers,
    ip,
    get(name) {
      return headers[String(name).toLowerCase()];
    },
  };
}

function createResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: undefined,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    getHeader(name) {
      return this.headers[String(name).toLowerCase()];
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function invokeWithOrigin(middleware, handler, req, res) {
  let continued = false;
  middleware(req, res, () => {
    continued = true;
    if (handler) handler(req, res);
  });
  return continued;
}

function signedMessage(wallet, message) {
  return crypto.sign(null, Buffer.from(message, 'utf8'), wallet.privateKey).toString('base64');
}

function cookiePair(response) {
  const setCookie = response.getHeader('set-cookie');
  assert.ok(setCookie, 'expected the server to set a session cookie');
  const firstCookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return firstCookie.split(';', 1)[0];
}

test('SIWS issues a one-time challenge, creates a durable session, updates profile, and revokes logout', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maze-identity-'));
  const dbPath = path.join(tempDir, 'identity.sqlite3');
  const store = new IdentityStore({ dbPath });
  const handlers = createIdentityHandlers({ store });
  const wallet = createWallet();
  const wrongWallet = createWallet();
  let cookie = '';

  t.after(() => {
    store.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // A request is only allowed to create a challenge from an explicitly
  // configured browser origin.
  const challengeRequest = createRequest({ body: { address: wallet.address }, ip: '127.0.0.10' });
  const challengeResponse = createResponse();
  assert.equal(
    invokeWithOrigin(handlers.requireTrustedOrigin, handlers.issueChallenge, challengeRequest, challengeResponse),
    true,
  );
  assert.equal(challengeResponse.statusCode, 200);
  assert.match(challengeResponse.body.message, /^maze\.example wants you to sign in with your Solana account:/);
  assert.match(challengeResponse.body.message, /Chain ID: solana:mainnet/);
  assert.match(challengeResponse.body.nonce, /^[a-f0-9]{32}$/);
  assert.deepEqual(challengeResponse.body.signInInput, {
    domain: 'maze.example',
    address: wallet.address,
    statement: 'Sign in to Maze. This request will not trigger a blockchain transaction or transfer assets.',
    uri: 'https://maze.example',
    version: '1',
    chainId: 'solana:mainnet',
    nonce: challengeResponse.body.nonce,
    issuedAt: challengeResponse.body.signInInput.issuedAt,
    expirationTime: challengeResponse.body.expiresAt,
  });

  // The structured Wallet Standard proof must be bound to the original
  // challenge bytes, not to arbitrary text supplied by the browser.
  const wrongMessage = `${challengeResponse.body.message}\nattacker-controlled`;
  const wrongMessageResponse = createResponse();
  invokeWithOrigin(
    handlers.requireTrustedOrigin,
    handlers.verifyChallenge,
    createRequest({
      body: {
        nonce: challengeResponse.body.nonce,
        address: wallet.address,
        signedMessage: Buffer.from(wrongMessage, 'utf8').toString('base64'),
        signature: signedMessage(wallet, wrongMessage),
      },
      ip: '127.0.0.10',
    }),
    wrongMessageResponse,
  );
  assert.equal(wrongMessageResponse.statusCode, 401);

  const wrongAddressResponse = createResponse();
  invokeWithOrigin(
    handlers.requireTrustedOrigin,
    handlers.verifyChallenge,
    createRequest({
      body: {
        nonce: challengeResponse.body.nonce,
        address: wrongWallet.address,
        signedMessage: Buffer.from(challengeResponse.body.message, 'utf8').toString('base64'),
        signature: signedMessage(wallet, challengeResponse.body.message),
      },
      ip: '127.0.0.10',
    }),
    wrongAddressResponse,
  );
  assert.equal(wrongAddressResponse.statusCode, 401);

  // A signature from another key is rejected and does not consume the nonce.
  const wrongSignatureRequest = createRequest({
    body: {
      nonce: challengeResponse.body.nonce,
      signature: signedMessage(wrongWallet, challengeResponse.body.message),
    },
    ip: '127.0.0.10',
  });
  const wrongSignatureResponse = createResponse();
  invokeWithOrigin(handlers.requireTrustedOrigin, handlers.verifyChallenge, wrongSignatureRequest, wrongSignatureResponse);
  assert.equal(wrongSignatureResponse.statusCode, 401);

  const verifyRequest = createRequest({
    body: {
      nonce: challengeResponse.body.nonce,
      address: wallet.address,
      signedMessage: Buffer.from(challengeResponse.body.message, 'utf8').toString('base64'),
      signature: signedMessage(wallet, challengeResponse.body.message),
      signatureType: 'ed25519',
    },
    ip: '127.0.0.10',
  });
  const verifyResponse = createResponse();
  invokeWithOrigin(handlers.requireTrustedOrigin, handlers.verifyChallenge, verifyRequest, verifyResponse);
  assert.equal(verifyResponse.statusCode, 200);
  assert.equal(verifyResponse.body.authenticated, true);
  assert.equal(verifyResponse.body.user.walletAddress, wallet.address);
  cookie = cookiePair(verifyResponse);
  assert.match(verifyResponse.getHeader('set-cookie'), /HttpOnly/);
  assert.match(verifyResponse.getHeader('set-cookie'), /SameSite=Lax/);

  // Session reads are server-backed, and remain available through a second
  // SQLite connection (the same persistence behaviour after a process restart).
  const secondStore = new IdentityStore({ dbPath });
  const secondHandlers = createIdentityHandlers({ store: secondStore });
  const sessionResponse = createResponse();
  secondHandlers.readSession(createRequest({ cookie }), sessionResponse);
  assert.equal(sessionResponse.statusCode, 200);
  assert.equal(sessionResponse.body.authenticated, true);
  assert.equal(sessionResponse.body.user.walletAddress, wallet.address);
  secondStore.close();

  // Profile changes are protected by both trusted Origin and a valid session.
  const profileRequest = createRequest({
    body: { username: 'Maze_Player', avatarUrl: 'https://cdn.example/avatar.png' },
    cookie,
    ip: '127.0.0.11',
  });
  const profileResponse = createResponse();
  let profileContinued = true;
  for (const middleware of handlers.updateProfile) {
    if (!profileContinued) break;
    profileContinued = false;
    middleware(profileRequest, profileResponse, () => { profileContinued = true; });
  }
  assert.equal(profileResponse.statusCode, 200);
  assert.equal(profileResponse.body.user.username, 'maze_player');
  assert.equal(profileResponse.body.user.avatarUrl, 'https://cdn.example/avatar.png');

  // The nonce is single-use: replaying the original valid proof is rejected.
  const replayResponse = createResponse();
  invokeWithOrigin(
    handlers.requireTrustedOrigin,
    handlers.verifyChallenge,
    createRequest({
      body: {
        nonce: challengeResponse.body.nonce,
        address: wallet.address,
        signedMessage: Buffer.from(challengeResponse.body.message, 'utf8').toString('base64'),
        signature: signedMessage(wallet, challengeResponse.body.message),
        signatureType: 'ed25519',
      },
      ip: '127.0.0.12',
    }),
    replayResponse,
  );
  assert.equal(replayResponse.statusCode, 400);

  // Logout revokes the server-side session, not just the client-side UI state.
  const logoutResponse = createResponse();
  invokeWithOrigin(
    handlers.requireTrustedOrigin,
    handlers.logout,
    createRequest({ cookie, ip: '127.0.0.13' }),
    logoutResponse,
  );
  assert.equal(logoutResponse.statusCode, 200);
  const afterLogoutResponse = createResponse();
  handlers.readSession(createRequest({ cookie }), afterLogoutResponse);
  assert.equal(afterLogoutResponse.body.authenticated, false);
});

test('SIWS verification rejects a different Origin and an unapproved browser origin', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maze-identity-origin-'));
  const store = new IdentityStore({ dbPath: path.join(tempDir, 'identity.sqlite3') });
  const handlers = createIdentityHandlers({ store });
  const wallet = createWallet();

  t.after(() => {
    store.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const challengeResponse = createResponse();
  invokeWithOrigin(
    handlers.requireTrustedOrigin,
    handlers.issueChallenge,
    createRequest({ body: { address: wallet.address }, origin: 'https://other.example', ip: '127.0.0.20' }),
    challengeResponse,
  );
  assert.equal(challengeResponse.statusCode, 200);

  const wrongOriginResponse = createResponse();
  invokeWithOrigin(
    handlers.requireTrustedOrigin,
    handlers.verifyChallenge,
    createRequest({
      body: {
        nonce: challengeResponse.body.nonce,
        signature: signedMessage(wallet, challengeResponse.body.message),
      },
      origin: 'https://maze.example',
      ip: '127.0.0.20',
    }),
    wrongOriginResponse,
  );
  assert.equal(wrongOriginResponse.statusCode, 400);

  const unapprovedResponse = createResponse();
  let reachedHandler = false;
  handlers.requireTrustedOrigin(
    createRequest({ origin: 'https://untrusted.example', ip: '127.0.0.21' }),
    unapprovedResponse,
    () => { reachedHandler = true; },
  );
  assert.equal(reachedHandler, false);
  assert.equal(unapprovedResponse.statusCode, 403);
});
