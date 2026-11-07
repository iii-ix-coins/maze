'use strict';
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class PriceDatabase {
    constructor(dbPath) {
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        this.db = new Database(dbPath);
        this.initTable();
    }

    initTable() {
        this.db.prepare(`
            CREATE TABLE IF NOT EXISTS prices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                timestamp_ms INTEGER NOT NULL,
                price_usd REAL NOT NULL,
                liquidity_usd REAL DEFAULT 0,
                tvl_usd REAL DEFAULT 0,
                provider TEXT NOT NULL,
                changes TEXT
            )
        `).run();

        try { this.db.prepare(`ALTER TABLE prices ADD COLUMN liquidity_usd REAL DEFAULT 0`).run(); } catch (err) { }
        try { this.db.prepare(`ALTER TABLE prices ADD COLUMN tvl_usd REAL DEFAULT 0`).run(); } catch (err) { }

        this.db.prepare(`
            CREATE INDEX IF NOT EXISTS idx_prices_timestamp_ms ON prices(timestamp_ms DESC)
        `).run();
    }

    insertRecord(record) {
        const timestampMs = new Date(record.timestamp).getTime();
        const stmt = this.db.prepare(`
            INSERT INTO prices (timestamp, timestamp_ms, price_usd, liquidity_usd, tvl_usd, provider, changes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
            record.timestamp,
            timestampMs,
            record.priceUsd,
            record.liquidityUsd || 0,
            record.tvlUsd || 0,
            record.provider,
            JSON.stringify(record.changes || {})
        );
    }

    findClosestRecord(targetTimeMs, maxDiffMs) {
        const minTime = targetTimeMs - maxDiffMs;
        const maxTime = targetTimeMs + maxDiffMs;

        const stmt = this.db.prepare(`
            SELECT timestamp, price_usd, provider, changes,
                   ABS(timestamp_ms - ?) as diff
            FROM prices
            WHERE timestamp_ms BETWEEN ? AND ?
            ORDER BY diff ASC
            LIMIT 1
        `);

        const row = stmt.get(targetTimeMs, minTime, maxTime);
        if (!row) return null;

        return {
            timestamp: row.timestamp,
            priceUsd: row.price_usd,
            provider: row.provider,
            changes: JSON.parse(row.changes || '{}')
        };
    }

    cleanOldRecords(maxDays = 15) {
        const cutoffTimeMs = Date.now() - (maxDays * 24 * 60 * 60 * 1000);
        this.db.prepare(`DELETE FROM prices WHERE timestamp_ms < ?`).run(cutoffTimeMs);
    }
}

module.exports = PriceDatabase;
