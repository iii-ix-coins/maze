'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
class JupiterMarketReadService {
    constructor({
        dbPath
    } = {}) {
        this.dbPath =
            dbPath ||
            path.join(
                __dirname,
                '..',
                '..',
                'engines',
                'pclqch-engine',
                'data',
                'jupiter-market.db'
            );
        this.db = null;
        this.statements = null;
    }
    _openIfNeeded() {
        if (
            this.db &&
            this.db.open
        ) {
            return true;
        }
        if (
            !fs.existsSync(
                this.dbPath
            )
        ) {
            return false;
        }
        this.db =
            new Database(
                this.dbPath,
                {
                    readonly: true,
                    fileMustExist: true
                }
            );
        this.db.pragma(
            'busy_timeout = 5000'
        );
        this.statements = {
            getCurrent:
                this.db.prepare(`
                    SELECT normalized_json
                    FROM jupiter_market_current
                    WHERE mint_address = ?
                `),
            getHistory:
                this.db.prepare(`
                    SELECT
                        id,
                        mint_address AS mintAddress,
                        fetched_at_ms AS fetchedAtMs,
                        fetched_at AS fetchedAt,
                        normalized_json AS normalizedJson
                    FROM jupiter_market_history
                    WHERE mint_address = ?
                    ORDER BY fetched_at_ms DESC
                    LIMIT ?
                `)
        };
        return true;
    }
    _parse(value) {
        try {
            return JSON.parse(
                value
            );
        } catch {
            return null;
        }
    }

    _publicize(data) {
        if (!data || typeof data !== 'object') {
            return data;
        }
        const result = { ...data };
        delete result.raw;
        return result;
    }
    getCurrent(mintAddress) {
        if (!this._openIfNeeded()) {
            return null;
        }
        const mint =
            String(
                mintAddress ?? ''
            ).trim();
        if (!mint) {
            return null;
        }
        const row =
            this.statements
                .getCurrent
                .get(mint);
        if (!row) {
            return null;
        }
        return this._publicize(
            this._parse(row.normalized_json)
        );
    }
    getHistory(
        mintAddress,
        limit = 100
    ) {
        if (!this._openIfNeeded()) {
            return null;
        }
        const mint =
            String(
                mintAddress ?? ''
            ).trim();
        if (!mint) {
            return [];
        }
        const numericLimit =
            Number(limit);
        const safeLimit =
            Number.isInteger(
                numericLimit
            ) &&
                numericLimit > 0
                ? Math.min(
                    numericLimit,
                    1000
                )
                : 100;
        return this.statements
            .getHistory
            .all(
                mint,
                safeLimit
            )
            .map(row => ({
                id:
                    row.id,
                mintAddress:
                    row.mintAddress,
                fetchedAtMs:
                    row.fetchedAtMs,
                fetchedAt:
                    row.fetchedAt,
                data:
                    this._publicize(
                        this._parse(row.normalizedJson)
                    )
            }));
    }
    close() {
        if (
            this.db &&
            this.db.open
        ) {
            this.db.close();
        }
        this.db = null;
        this.statements = null;
    }
}
module.exports =
    JupiterMarketReadService;
