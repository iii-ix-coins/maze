'use strict';
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
class VerifyDatabase {
    constructor(dbPath) {
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('synchronous = NORMAL');
        this.initTables();
    }
    initTables() {
        this.db.prepare(`
            CREATE TABLE IF NOT EXISTS holder_ages (
                wallet TEXT PRIMARY KEY,
                first_buy_timestamp INTEGER NOT NULL,
                first_buy_signature TEXT,
                age_in_seconds INTEGER NOT NULL,
                earned_reward_usd REAL DEFAULT 0,
                last_calculated_at TEXT NOT NULL
            )
        `).run();
        this.db.prepare(`
            CREATE INDEX IF NOT EXISTS idx_holder_first_buy ON holder_ages(first_buy_timestamp ASC)
        `).run();
    }
    upsertHolderAge(data) {
        const stmt = this.db.prepare(`
            INSERT INTO holder_ages (wallet, first_buy_timestamp, first_buy_signature, age_in_seconds, earned_reward_usd, last_calculated_at)
            VALUES (@wallet, @firstBuyTimestamp, @firstBuySignature, @ageInSeconds, @earnedRewardUsd, @lastCalculatedAt)
            ON CONFLICT(wallet) DO UPDATE SET
                first_buy_timestamp = excluded.first_buy_timestamp,
                first_buy_signature = excluded.first_buy_signature,
                age_in_seconds = excluded.age_in_seconds,
                earned_reward_usd = excluded.earned_reward_usd,
                last_calculated_at = excluded.last_calculated_at
        `);
        stmt.run(data);
    }
    upsertHolderAges(rows) {
        if (!Array.isArray(rows) || rows.length === 0) {
            return 0;
        }

        const stmt = this.db.prepare(`
            INSERT INTO holder_ages (
                wallet,
                first_buy_timestamp,
                first_buy_signature,
                age_in_seconds,
                earned_reward_usd,
                last_calculated_at
            )
            VALUES (
                @wallet,
                @firstBuyTimestamp,
                @firstBuySignature,
                @ageInSeconds,
                @earnedRewardUsd,
                @lastCalculatedAt
            )
            ON CONFLICT(wallet) DO UPDATE SET
                first_buy_timestamp = excluded.first_buy_timestamp,
                first_buy_signature = excluded.first_buy_signature,
                age_in_seconds = excluded.age_in_seconds,
                earned_reward_usd = excluded.earned_reward_usd,
                last_calculated_at = excluded.last_calculated_at
        `);

        const transaction = this.db.transaction(items => {
            for (const row of items) {
                stmt.run(row);
            }
        });

        transaction(rows);
        return rows.length;
    }

    close() {
        this.db.close();
    }
}
module.exports = VerifyDatabase;
