'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { randomUUID } = require('node:crypto');

const DEFAULT_DB_PATH = path.join(__dirname, '..', 'data', 'identity.sqlite3');

function normalizeUser(row) {
    if (!row) return null;
    return {
        id: row.id,
        username: row.username,
        avatarUrl: row.avatar_url,
        walletAddress: row.wallet_address
    };
}

class IdentityStore {
    constructor({ dbPath } = {}) {
        const configuredPath = dbPath || process.env.IDENTITY_DB_PATH;
        this.dbPath = configuredPath ? path.resolve(configuredPath) : DEFAULT_DB_PATH;
        this.db = null;
        this.statements = null;
        this.lastCleanupAt = 0;
    }

    _open() {
        if (this.db?.open) return;

        fs.mkdirSync(path.dirname(this.dbPath), { recursive: true, mode: 0o700 });
        this.db = new Database(this.dbPath);
        try { fs.chmodSync(this.dbPath, 0o600); } catch { /* Filesystem ACLs may not expose POSIX modes. */ }
        this.db.pragma('journal_mode = WAL');
        // Authentication writes are low-volume; FULL keeps nonce consumption and revocation durable.
        this.db.pragma('synchronous = FULL');
        this.db.pragma('foreign_keys = ON');
        this.db.pragma('busy_timeout = 5000');

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS identity_users (
                id TEXT PRIMARY KEY,
                username TEXT COLLATE NOCASE UNIQUE,
                avatar_url TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS identity_wallets (
                address TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
                chain TEXT NOT NULL DEFAULT 'solana:mainnet',
                verified_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_identity_wallets_user
                ON identity_wallets(user_id);

            CREATE TABLE IF NOT EXISTS identity_challenges (
                nonce TEXT PRIMARY KEY,
                wallet_address TEXT NOT NULL,
                origin TEXT NOT NULL,
                message TEXT NOT NULL,
                issued_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                consumed_at INTEGER
            );

            CREATE INDEX IF NOT EXISTS idx_identity_challenges_expiry
                ON identity_challenges(expires_at);

            CREATE TABLE IF NOT EXISTS identity_sessions (
                token_hash TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
                wallet_address TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                revoked_at INTEGER
            );

            CREATE INDEX IF NOT EXISTS idx_identity_sessions_user
                ON identity_sessions(user_id, expires_at);
            CREATE INDEX IF NOT EXISTS idx_identity_sessions_expiry
                ON identity_sessions(expires_at);
            CREATE INDEX IF NOT EXISTS idx_identity_sessions_revoked
                ON identity_sessions(revoked_at);
        `);

        this.statements = {
            insertChallenge: this.db.prepare(`
                INSERT INTO identity_challenges
                    (nonce, wallet_address, origin, message, issued_at, expires_at)
                VALUES (?, ?, ?, ?, ?, ?)
            `),
            getChallenge: this.db.prepare(`
                SELECT nonce, wallet_address, origin, message, issued_at, expires_at, consumed_at
                FROM identity_challenges
                WHERE nonce = ?
            `),
            consumeChallenge: this.db.prepare(`
                UPDATE identity_challenges
                SET consumed_at = ?
                WHERE nonce = ?
                  AND wallet_address = ?
                  AND consumed_at IS NULL
                  AND expires_at > ?
            `),
            getWallet: this.db.prepare(`
                SELECT user_id FROM identity_wallets WHERE address = ?
            `),
            insertUser: this.db.prepare(`
                INSERT INTO identity_users (id, created_at, updated_at)
                VALUES (?, ?, ?)
            `),
            insertWallet: this.db.prepare(`
                INSERT INTO identity_wallets (address, user_id, verified_at)
                VALUES (?, ?, ?)
            `),
            getUser: this.db.prepare(`
                SELECT
                    users.id,
                    users.username,
                    users.avatar_url,
                    wallets.address AS wallet_address
                FROM identity_users AS users
                JOIN identity_wallets AS wallets ON wallets.user_id = users.id
                WHERE users.id = ? AND wallets.address = ?
            `),
            insertSession: this.db.prepare(`
                INSERT INTO identity_sessions
                    (token_hash, user_id, wallet_address, created_at, expires_at)
                VALUES (?, ?, ?, ?, ?)
            `),
            getSession: this.db.prepare(`
                SELECT
                    users.id,
                    sessions.wallet_address,
                    sessions.expires_at,
                    users.username,
                    users.avatar_url
                FROM identity_sessions AS sessions
                JOIN identity_users AS users ON users.id = sessions.user_id
                JOIN identity_wallets AS wallets
                  ON wallets.user_id = sessions.user_id
                 AND wallets.address = sessions.wallet_address
                WHERE sessions.token_hash = ?
                  AND sessions.revoked_at IS NULL
                  AND sessions.expires_at > ?
                LIMIT 1
            `),
            revokeSession: this.db.prepare(`
                UPDATE identity_sessions
                SET revoked_at = ?
                WHERE token_hash = ? AND revoked_at IS NULL
            `),
            updateProfile: this.db.prepare(`
                UPDATE identity_users
                SET username = ?, avatar_url = ?, updated_at = ?
                WHERE id = ?
            `),
            cleanupChallenges: this.db.prepare(`
                DELETE FROM identity_challenges WHERE expires_at <= ?
            `),
            cleanupSessions: this.db.prepare(`
                DELETE FROM identity_sessions
                WHERE expires_at <= ? OR revoked_at IS NOT NULL AND revoked_at <= ?
            `)
        };

        this.createSessionTransaction = this.db.transaction((input) => {
            const consumed = this.statements.consumeChallenge.run(
                input.now,
                input.nonce,
                input.walletAddress,
                input.now
            );
            if (consumed.changes !== 1) return null;

            let identity = this.statements.getWallet.get(input.walletAddress);
            let userId = identity?.user_id;
            if (!userId) {
                userId = randomUUID();
                this.statements.insertUser.run(userId, input.now, input.now);
                this.statements.insertWallet.run(input.walletAddress, userId, input.now);
            }

            this.statements.insertSession.run(
                input.tokenHash,
                userId,
                input.walletAddress,
                input.now,
                input.expiresAt
            );

            return normalizeUser(this.statements.getUser.get(userId, input.walletAddress));
        });
    }

    createChallenge(input) {
        this._open();
        // Opportunistic cleanup runs at most once per minute, with no timer or background worker.
        if (input.now - this.lastCleanupAt >= 60_000) {
            this.statements.cleanupChallenges.run(input.now);
            this.statements.cleanupSessions.run(input.now, input.now - 7 * 24 * 60 * 60 * 1000);
            this.lastCleanupAt = input.now;
        }
        this.statements.insertChallenge.run(
            input.nonce,
            input.walletAddress,
            input.origin,
            input.message,
            input.now,
            input.expiresAt
        );
    }

    getChallenge(nonce) {
        this._open();
        return this.statements.getChallenge.get(nonce) || null;
    }

    consumeChallengeAndCreateSession(input) {
        this._open();
        return this.createSessionTransaction(input);
    }

    getSession(tokenHash, now) {
        this._open();
        const row = this.statements.getSession.get(tokenHash, now);
        return row ? normalizeUser(row) : null;
    }

    revokeSession(tokenHash, now) {
        this._open();
        this.statements.revokeSession.run(now, tokenHash);
    }

    updateProfile(userId, input) {
        this._open();
        this.statements.updateProfile.run(
            input.username,
            input.avatarUrl,
            input.now,
            userId
        );
        const row = this.db.prepare(`
            SELECT
                users.id,
                users.username,
                users.avatar_url,
                wallets.address AS wallet_address
            FROM identity_users AS users
            JOIN identity_wallets AS wallets ON wallets.user_id = users.id
            WHERE users.id = ? AND wallets.address = ?
            LIMIT 1
        `).get(userId, input.walletAddress);
        return normalizeUser(row);
    }

    close() {
        if (this.db?.open) this.db.close();
        this.db = null;
        this.statements = null;
    }
}

module.exports = { IdentityStore };
