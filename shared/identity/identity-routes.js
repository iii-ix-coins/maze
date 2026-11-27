'use strict';

const {
    createHash,
    createPublicKey,
    randomBytes,
    verify: verifyEd25519
} = require('node:crypto');
const { PublicKey } = require('@solana/web3.js');
const { IdentityStore } = require('./identity-store');

const CHALLENGE_TTL_MS = clampInteger(process.env.IDENTITY_CHALLENGE_TTL_SECONDS, 300, 60, 600) * 1000;
const SESSION_TTL_MS = clampInteger(process.env.IDENTITY_SESSION_TTL_DAYS, 30, 1, 90) * 24 * 60 * 60 * 1000;
const RATE_WINDOW_MS = 5 * 60 * 1000;
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const secureCookie = process.env.NODE_ENV === 'production'
    || String(process.env.AUTH_COOKIE_SECURE || '').toLowerCase() === 'true';
const cookieName = secureCookie ? '__Host-maze_session' : 'maze_session';
const rateBuckets = new Map();

function clampInteger(value, fallback, min, max) {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
}

function getAllowedOrigins() {
    const configured = [
        ...String(process.env.IDENTITY_ALLOWED_ORIGINS || '').split(','),
        process.env.VITE_APP_URL || ''
    ];
    const origins = new Set();
    for (const candidate of configured) {
        const value = String(candidate || '').trim();
        if (!value) continue;
        try {
            const parsed = new URL(value);
            if (parsed.protocol === 'https:' || parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
                origins.add(parsed.origin);
            }
        } catch {
            // Ignore malformed configuration rather than accepting a partial origin.
        }
    }

    if (process.env.NODE_ENV !== 'production') {
        origins.add('http://localhost:5173');
        origins.add('http://127.0.0.1:5173');
        origins.add('http://localhost:5000');
        origins.add('http://127.0.0.1:5000');
    }
    return origins;
}

const allowedOrigins = getAllowedOrigins();

function setNoStore(res) {
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Pragma', 'no-cache');
    const vary = String(res.getHeader('Vary') || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    if (!vary.includes('*')) {
        for (const header of ['Cookie', 'Origin']) {
            if (!vary.some((value) => value.toLowerCase() === header.toLowerCase())) vary.push(header);
        }
        res.setHeader('Vary', vary.join(', '));
    }
}

function sendError(res, status, error) {
    setNoStore(res);
    return res.status(status).json({ error });
}

function requireTrustedOrigin(req, res, next) {
    const origin = req.get('origin');
    if (!origin || !allowedOrigins.has(origin)) {
        return sendError(res, 403, 'This request origin is not allowed.');
    }
    if (req.get('sec-fetch-site') === 'cross-site') {
        return sendError(res, 403, 'Cross-site requests are not allowed.');
    }
    req.identityOrigin = origin;
    return next();
}

function rateLimit(req, res, scope, key, limit) {
    const now = Date.now();
    const bucketKey = `${scope}:${req.ip || 'unknown'}:${key || ''}`;
    let bucket = rateBuckets.get(bucketKey);
    if (!bucket || now - bucket.startedAt >= RATE_WINDOW_MS) {
        bucket = { startedAt: now, count: 0 };
    }
    bucket.count += 1;
    rateBuckets.set(bucketKey, bucket);

    // Opportunistic pruning avoids timers and background work.
    if (rateBuckets.size > 2048) {
        for (const [storedKey, storedBucket] of rateBuckets) {
            if (now - storedBucket.startedAt >= RATE_WINDOW_MS) rateBuckets.delete(storedKey);
        }
        while (rateBuckets.size > 2048) {
            const oldestKey = rateBuckets.keys().next().value;
            if (!oldestKey) break;
            rateBuckets.delete(oldestKey);
        }
    }

    if (bucket.count > limit) {
        res.setHeader('Retry-After', String(Math.max(1, Math.ceil((RATE_WINDOW_MS - (now - bucket.startedAt)) / 1000))));
        sendError(res, 429, 'Too many authentication attempts. Please try again shortly.');
        return false;
    }
    return true;
}

function canonicalWalletAddress(value) {
    if (typeof value !== 'string' || value.length < 32 || value.length > 44) return null;
    try {
        const publicKey = new PublicKey(value);
        const canonical = publicKey.toBase58();
        return canonical === value ? canonical : null;
    } catch {
        return null;
    }
}

function hashToken(token) {
    return createHash('sha256').update(token, 'utf8').digest('hex');
}

function getCookie(req, name) {
    const raw = String(req.headers.cookie || '');
    for (const part of raw.split(';')) {
        const separator = part.indexOf('=');
        if (separator < 0) continue;
        if (part.slice(0, separator).trim() !== name) continue;
        return part.slice(separator + 1).trim();
    }
    return null;
}

function getSessionToken(req) {
    const token = getCookie(req, cookieName);
    return token && /^[A-Za-z0-9_-]{40,50}$/.test(token) ? token : null;
}

function sessionCookie(token, maxAgeSeconds) {
    const secure = secureCookie ? '; Secure' : '';
    return `${cookieName}=${token}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax${secure}`;
}

function expiredSessionCookies() {
    const secure = secureCookie ? '; Secure' : '';
    return [
        `${cookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`,
        `maze_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
        `__Host-maze_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`
    ];
}

function clearSessionCookie(res) {
    res.setHeader('Set-Cookie', expiredSessionCookies());
}

function decodeBase64Bytes(value, maxLength) {
    if (typeof value !== 'string' || value.length > maxLength || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
    const bytes = Buffer.from(value, 'base64');
    if (!bytes.length || bytes.toString('base64') !== value) return null;
    return bytes;
}

function decodeSignature(value) {
    const signature = decodeBase64Bytes(value, 256);
    return signature?.length === 64 ? signature : null;
}

function decodeSignedMessage(value) {
    const message = decodeBase64Bytes(value, 4096);
    return message && message.length <= 2048 ? message : null;
}

function verifyWalletSignature(address, message, signature) {

    const rawPublicKey = new PublicKey(address).toBytes();
    const publicKey = createPublicKey({
        key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(rawPublicKey)]),
        format: 'der',
        type: 'spki'
    });
    const messageBytes = Buffer.isBuffer(message) ? message : Buffer.from(message, 'utf8');
    return verifyEd25519(null, messageBytes, publicKey, signature);
}

function createSiwsInput({ origin, address, nonce, issuedAt, expirationTime }) {
    return {
        domain: new URL(origin).host,
        address,
        statement: 'Sign in to Maze. This request will not trigger a blockchain transaction or transfer assets.',
        uri: origin,
        version: '1',
        chainId: 'solana:mainnet',
        nonce,
        issuedAt,
        expirationTime
    };
}

function createSiwsMessage(input) {
    return [
        `${input.domain} wants you to sign in with your Solana account:`,
        input.address,
        '',
        input.statement,
        '',
        `URI: ${input.uri}`,
        `Version: ${input.version}`,
        `Chain ID: ${input.chainId}`,
        `Nonce: ${input.nonce}`,
        `Issued At: ${input.issuedAt}`,
        `Expiration Time: ${input.expirationTime}`
    ].join('\n');
}

function normalizeUsername(value) {
    if (value == null || value === '') return null;
    if (typeof value !== 'string') return undefined;
    const normalized = value.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(normalized)) return undefined;
    return normalized;
}

function normalizeAvatarUrl(value) {
    if (value == null || value === '') return null;
    if (typeof value !== 'string' || value.length > 2048) return undefined;
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return undefined;
        return url.href;
    } catch {
        return undefined;
    }
}

function publicUser(user) {
    return {
        id: user.id,
        username: user.username,
        avatarUrl: user.avatarUrl,
        walletAddress: user.walletAddress
    };
}

function createIdentityHandlers({ store = new IdentityStore() } = {}) {
    function getSessionUser(req) {
        const token = getSessionToken(req);
        return token ? store.getSession(hashToken(token), Date.now()) : null;
    }

    function readAuthenticatedUser(req, res) {
        const rawToken = getCookie(req, cookieName);
        const user = getSessionUser(req);
        if (rawToken && !user) clearSessionCookie(res);
        return user;
    }

    function requireSession(req, res, next) {
        const user = readAuthenticatedUser(req, res);
        if (!user) return sendError(res, 401, 'Authentication is required.');
        req.identityUser = user;
        return next();
    }

    return {
        issueChallenge(req, res) {
            setNoStore(res);
            const address = canonicalWalletAddress(req.body?.address);
            if (!address) return sendError(res, 400, 'A valid Solana wallet address is required.');
            if (!rateLimit(req, res, 'challenge-ip', '', 30)) return;
            if (!rateLimit(req, res, 'challenge-wallet', address, 8)) return;

            try {
                const now = Date.now();
                const nonce = randomBytes(16).toString('hex');
                const issuedAt = new Date(now).toISOString();
                const expiresAt = now + CHALLENGE_TTL_MS;
                const expirationTime = new Date(expiresAt).toISOString();
                const signInInput = createSiwsInput({
                    origin: req.identityOrigin,
                    address,
                    nonce,
                    issuedAt,
                    expirationTime
                });
                const message = createSiwsMessage(signInInput);

                store.createChallenge({
                    nonce,
                    walletAddress: address,
                    origin: req.identityOrigin,
                    message,
                    now,
                    expiresAt
                });

                return res.json({
                    nonce,
                    message,
                    signInInput,
                    expiresAt: expirationTime
                });
            } catch (error) {
                console.error('[Identity] Could not create a sign-in challenge:', error?.message || error);
                return sendError(res, 503, 'Sign-in is temporarily unavailable.');
            }
        },

        verifyChallenge(req, res) {
            setNoStore(res);
            const nonce = typeof req.body?.nonce === 'string' ? req.body.nonce : '';
            const signature = decodeSignature(req.body?.signature);
            const hasAddress = req.body?.address !== undefined;
            const hasSignedMessage = req.body?.signedMessage !== undefined;
            const suppliedAddress = hasAddress ? canonicalWalletAddress(req.body.address) : null;
            const signedMessage = hasSignedMessage ? decodeSignedMessage(req.body.signedMessage) : null;
            const hasCompleteStandardProof = hasAddress && hasSignedMessage;
            if (
                !/^[a-f0-9]{32}$/.test(nonce)
                || !signature
                || (hasAddress !== hasSignedMessage)
                || (hasCompleteStandardProof && (!suppliedAddress || !signedMessage))
                || (req.body?.signatureType !== undefined && req.body.signatureType !== 'ed25519')
            ) {
                return sendError(res, 400, 'The sign-in response is invalid.');
            }
            if (!rateLimit(req, res, 'verify-ip', '', 20)) return;

            try {
                const challenge = store.getChallenge(nonce);
                const now = Date.now();
                if (
                    !challenge
                    || challenge.consumed_at != null
                    || challenge.expires_at <= now
                    || challenge.origin !== req.identityOrigin
                ) {
                    return sendError(res, 400, 'The sign-in request has expired or is no longer valid.');
                }
                if (!rateLimit(req, res, 'verify-wallet', challenge.wallet_address, 8)) return;
                if (hasCompleteStandardProof && suppliedAddress !== challenge.wallet_address) {
                    return sendError(res, 401, 'The signed wallet does not match the sign-in challenge.');
                }

                // Wallet Standard returns the exact bytes it signed. Never trust a
                // client-supplied message: require byte-for-byte equality with the
                // server's stored challenge before checking the Ed25519 signature.
                const messageBytes = hasCompleteStandardProof
                    ? signedMessage
                    : Buffer.from(challenge.message, 'utf8');
                if (hasCompleteStandardProof && !messageBytes.equals(Buffer.from(challenge.message, 'utf8'))) {
                    return sendError(res, 401, 'The wallet signed a different sign-in message.');
                }

                let signatureIsValid = false;
                try {
                    signatureIsValid = verifyWalletSignature(
                        challenge.wallet_address,
                        messageBytes,
                        signature
                    );
                } catch {
                    signatureIsValid = false;
                }
                if (!signatureIsValid) return sendError(res, 401, 'Wallet signature verification failed.');

                const token = randomBytes(32).toString('base64url');
                const expiresAt = now + SESSION_TTL_MS;
                const user = store.consumeChallengeAndCreateSession({
                    nonce,
                    walletAddress: challenge.wallet_address,
                    tokenHash: hashToken(token),
                    now,
                    expiresAt
                });
                if (!user) return sendError(res, 409, 'This sign-in request has already been used. Please try again.');

                res.setHeader('Set-Cookie', sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000)));
                res.setHeader('Cache-Control', 'no-store, private');
                return res.json({
                    authenticated: true,
                    user: publicUser(user),
                    expiresAt: new Date(expiresAt).toISOString()
                });
            } catch (error) {
                console.error('[Identity] Could not verify a sign-in response:', error?.message || error);
                return sendError(res, 503, 'Sign-in is temporarily unavailable.');
            }
        },

        readSession(req, res) {
            setNoStore(res);
            try {
                const user = readAuthenticatedUser(req, res);
                return res.json(user
                    ? { authenticated: true, user: publicUser(user) }
                    : { authenticated: false, user: null });
            } catch (error) {
                console.error('[Identity] Could not read the current session:', error?.message || error);
                return sendError(res, 503, 'The account session is temporarily unavailable.');
            }
        },

        logout(req, res) {
            setNoStore(res);
            try {
                const token = getSessionToken(req);
                if (token) store.revokeSession(hashToken(token), Date.now());
                clearSessionCookie(res);
                return res.status(200).json({ authenticated: false });
            } catch (error) {
                console.error('[Identity] Could not revoke the account session:', error?.message || error);
                return sendError(res, 503, 'Logout is temporarily unavailable. Please retry.');
            }
        },

        updateProfile: [requireTrustedOrigin, requireSession, (req, res) => {
            setNoStore(res);
            const username = normalizeUsername(req.body?.username === undefined
                ? req.identityUser.username
                : req.body.username);
            const avatarUrl = normalizeAvatarUrl(req.body?.avatarUrl === undefined
                ? req.identityUser.avatarUrl
                : req.body.avatarUrl);
            if (username === undefined) {
                return sendError(res, 400, 'Username must be 3–20 characters using letters, numbers or underscores.');
            }
            if (avatarUrl === undefined) {
                return sendError(res, 400, 'Avatar URL must be a valid HTTPS image URL.');
            }

            try {
                const user = store.updateProfile(req.identityUser.id, {
                    username,
                    avatarUrl,
                    walletAddress: req.identityUser.walletAddress,
                    now: Date.now()
                });
                return res.json({ user: publicUser(user) });
            } catch (error) {
                if (String(error?.code || '').startsWith('SQLITE_CONSTRAINT')) {
                    return sendError(res, 409, 'This username is already in use.');
                }
                console.error('[Identity] Could not update the profile:', error?.message || error);
                return sendError(res, 503, 'The profile could not be updated. Please try again.');
            }
        }],

        requireTrustedOrigin,
        requireSession,
        getSessionUser,
        /**
         * Session snapshot for HTML bootstrap. Same payload as GET /api/auth/session,
         * but returned to the caller instead of being sent. Clears a stale cookie.
         */
        readSessionSnapshot(req, res) {
            const user = readAuthenticatedUser(req, res);
            return user ? publicUser(user) : null;
        },
        close() {
            store.close();
        }
    };
}

module.exports = { createIdentityHandlers };
