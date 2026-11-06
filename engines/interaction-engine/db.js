'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const ALLOWED_ACTIONS = Object.freeze([
    'view',
    'like',
    'share'
]);

const STATS_ROW_ID = 1;

class InteractionDatabase {
    constructor(dbPath) {
        if (
            typeof dbPath !== 'string' ||
            dbPath.trim() === ''
        ) {
            throw new TypeError(
                'dbPath is required.'
            );
        }

        const resolvedPath =
            path.resolve(dbPath);

        const dir =
            path.dirname(resolvedPath);

        fs.mkdirSync(
            dir,
            {
                recursive: true
            }
        );

        this.db =
            new Database(
                resolvedPath
            );

        /*
         * Production SQLite settings.
         *
         * WAL:
         * - allows readers while writer is active
         * - better for independent Web + Engine processes
         *
         * NORMAL:
         * - good durability/performance balance
         *
         * busy_timeout:
         * - prevents immediate SQLITE_BUSY failures
         *   during short concurrent access windows
         */
        this.db.pragma(
            'journal_mode = WAL'
        );

        this.db.pragma(
            'synchronous = NORMAL'
        );

        this.db.pragma(
            'foreign_keys = ON'
        );

        this.db.pragma(
            'busy_timeout = 5000'
        );

        this.initTables();
        this.prepareStatements();
        this.createTransactions();
    }

    initTables() {
        this.db.prepare(`
            CREATE TABLE IF NOT EXISTS stats (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                views INTEGER NOT NULL DEFAULT 0,
                likes INTEGER NOT NULL DEFAULT 0,
                shares INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL
            )
        `).run();

        /*
         * Backward-compatible migration.
         *
         * Older databases may already have the stats
         * table without updated_at.
         */
        this.ensureStatsUpdatedAt();

        this.db.prepare(`
            INSERT OR IGNORE INTO stats
            (
                id,
                views,
                likes,
                shares,
                updated_at
            )
            VALUES
            (
                1,
                0,
                0,
                0,
                ?
            )
        `).run(Date.now());

        this.db.prepare(`
            CREATE TABLE IF NOT EXISTS interaction_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                action TEXT NOT NULL
                    CHECK (
                        action IN (
                            'view',
                            'like',
                            'share'
                        )
                    ),
                created_at INTEGER NOT NULL
            )
        `).run();

        this.db.prepare(`
            CREATE INDEX IF NOT EXISTS
            idx_interaction_events_created_at
            ON interaction_events(created_at)
        `).run();

        this.db.prepare(`
            CREATE INDEX IF NOT EXISTS
            idx_interaction_events_action_time
            ON interaction_events(
                action,
                created_at
            )
        `).run();
    }

    ensureStatsUpdatedAt() {
        const columns =
            this.db.prepare(`
                PRAGMA table_info(stats)
            `).all();

        const hasUpdatedAt =
            columns.some(
                column =>
                    column.name === 'updated_at'
            );

        if (!hasUpdatedAt) {
            this.db.prepare(`
                ALTER TABLE stats
                ADD COLUMN updated_at INTEGER
            `).run();

            this.db.prepare(`
                UPDATE stats
                SET updated_at = ?
                WHERE updated_at IS NULL
            `).run(Date.now());
        }
    }

    prepareStatements() {
        this.insertEventStmt =
            this.db.prepare(`
                INSERT INTO interaction_events
                (
                    action,
                    created_at
                )
                VALUES
                (
                    ?,
                    ?
                )
            `);

        this.updateStatsStmts = {
            view:
                this.db.prepare(`
                    UPDATE stats
                    SET
                        views = views + 1,
                        updated_at = ?
                    WHERE id = ${STATS_ROW_ID}
                `),

            like:
                this.db.prepare(`
                    UPDATE stats
                    SET
                        likes = likes + 1,
                        updated_at = ?
                    WHERE id = ${STATS_ROW_ID}
                `),

            share:
                this.db.prepare(`
                    UPDATE stats
                    SET
                        shares = shares + 1,
                        updated_at = ?
                    WHERE id = ${STATS_ROW_ID}
                `)
        };

        this.getStatsStmt =
            this.db.prepare(`
                SELECT
                    views,
                    likes,
                    shares,
                    updated_at
                FROM stats
                WHERE id = ${STATS_ROW_ID}
            `);

        this.cleanupStmt =
            this.db.prepare(`
                DELETE FROM interaction_events
                WHERE created_at < ?
            `);

        this.countEventsStmt =
            this.db.prepare(`
                SELECT
                    COUNT(*) AS count
                FROM interaction_events
            `);
    }

    createTransactions() {
        this.recordInteractionTransaction =
            this.db.transaction(
                (
                    action,
                    timestamp
                ) => {
                    this.insertEventStmt.run(
                        action,
                        timestamp
                    );

                    const updateStmt =
                        this.updateStatsStmts[
                        action
                        ];

                    updateStmt.run(
                        timestamp
                    );

                    return this.getStats();
                }
            );
    }

    getStats() {
        const row =
            this.getStatsStmt.get();

        return {
            views:
                Number(
                    row?.views
                ) || 0,

            likes:
                Number(
                    row?.likes
                ) || 0,

            shares:
                Number(
                    row?.shares
                ) || 0,

            updatedAt:
                Number.isFinite(
                    row?.updated_at
                )
                    ? new Date(
                        row.updated_at
                    ).toISOString()
                    : null
        };
    }

    recordInteraction(
        action,
        timestamp = Date.now()
    ) {
        if (
            typeof action !== 'string' ||
            !ALLOWED_ACTIONS.includes(
                action
            )
        ) {
            throw new TypeError(
                `Invalid interaction action: ${action}`
            );
        }

        if (
            !Number.isFinite(
                timestamp
            ) ||
            timestamp < 0
        ) {
            throw new TypeError(
                'timestamp must be a valid non-negative number.'
            );
        }

        return this.recordInteractionTransaction(
            action,
            Math.floor(timestamp)
        );
    }

    cleanupOlderThan(
        cutoffTimestamp
    ) {
        if (
            !Number.isFinite(
                cutoffTimestamp
            ) ||
            cutoffTimestamp < 0
        ) {
            throw new TypeError(
                'cutoffTimestamp must be a valid non-negative number.'
            );
        }

        const result =
            this.cleanupStmt.run(
                Math.floor(
                    cutoffTimestamp
                )
            );

        return result.changes;
    }

    countEvents() {
        const row =
            this.countEventsStmt.get();

        return (
            Number(
                row?.count
            ) || 0
        );
    }

    close() {
        if (
            this.db &&
            this.db.open
        ) {
            this.db.close();
        }

        this.db = null;

        this.insertEventStmt = null;
        this.updateStatsStmts = null;
        this.getStatsStmt = null;
        this.cleanupStmt = null;
        this.countEventsStmt = null;
        this.recordInteractionTransaction = null;
    }
}

module.exports =
    InteractionDatabase;