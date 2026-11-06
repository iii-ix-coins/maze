'use strict';

const fs = require('fs');
const Database = require('better-sqlite3');

class HolderAgeCalculator {
    constructor(holdersDbPath, txDbPath, verifyDbInstance) {
        this.holdersDbPath = holdersDbPath;
        this.txDbPath = txDbPath;
        this.verifyDb = verifyDbInstance;
    }

    async calculateAges() {
        if (!fs.existsSync(this.holdersDbPath) || !fs.existsSync(this.txDbPath)) {
            return 0;
        }

        const holdersDb = new Database(this.holdersDbPath, {
            readonly: true,
            fileMustExist: true
        });

        let attached = false;

        try {
            holdersDb.pragma('busy_timeout = 5000');
            holdersDb.prepare('ATTACH DATABASE ? AS txdb').run(this.txDbPath);
            attached = true;

            const nowSec = Math.floor(Date.now() / 1000);
            const rewardRatePerSecond = 0.1 / 86400;

            const rows = holdersDb.prepare(`
                WITH eligible AS (
                    SELECT
                        h.wallet,
                        h.last_sell_all_time,
                        CASE
                            WHEN h.last_sell_all_time IS NULL THEN 0
                            ELSE CAST(h.last_sell_all_time / 1000 AS INTEGER) - 120
                        END AS buy_boundary_sec
                    FROM holders_list h
                    WHERE h.state = 'user'
                      AND h.raw_amount <> '0'
                ),
                first_buy AS (
                    SELECT
                        e.wallet,
                        MIN(b.blockTime) AS first_buy_timestamp
                    FROM eligible e
                    INNER JOIN txdb.buyers b
                        ON b.buyerWallet = e.wallet
                       AND b.isPaidPurchase = 1
                       AND b.blockTime >= e.buy_boundary_sec
                    GROUP BY e.wallet
                )
                SELECT
                    e.wallet,
                    fb.first_buy_timestamp,
                    b.signature
                FROM eligible e
                INNER JOIN first_buy fb
                    ON fb.wallet = e.wallet
                INNER JOIN txdb.buyers b
                    ON b.buyerWallet = fb.wallet
                   AND b.isPaidPurchase = 1
                   AND b.blockTime = fb.first_buy_timestamp
                ORDER BY e.wallet ASC, b.signature ASC
            `).all();

            const soldOutRows = holdersDb.prepare(`
                SELECT wallet
                FROM holders_list
                WHERE state = 'user'
                  AND raw_amount = '0'
            `).all();

            const output = [];
            const seen = new Set();

            for (const row of rows) {
                if (seen.has(row.wallet)) continue;
                seen.add(row.wallet);

                const firstBuyTimestamp = Number(row.first_buy_timestamp);
                if (!Number.isFinite(firstBuyTimestamp)) continue;

                const ageInSeconds = Math.max(nowSec - firstBuyTimestamp, 0);
                const earnedRewardUsd = Number(
                    (ageInSeconds * rewardRatePerSecond).toFixed(6)
                );

                output.push({
                    wallet: row.wallet,
                    firstBuyTimestamp,
                    firstBuySignature: row.signature || '',
                    ageInSeconds,
                    earnedRewardUsd,
                    lastCalculatedAt: new Date().toISOString()
                });
            }

            for (const row of soldOutRows) {
                if (seen.has(row.wallet)) continue;
                seen.add(row.wallet);
                output.push({
                    wallet: row.wallet,
                    firstBuyTimestamp: 0,
                    firstBuySignature: 'SOLD_ALL_TOKENS',
                    ageInSeconds: 0,
                    earnedRewardUsd: 0,
                    lastCalculatedAt: new Date().toISOString()
                });
            }

            if (output.length > 0) {
                this.verifyDb.upsertHolderAges(output);
            }

            if (output.length > 0) {
                console.log(
                    `[Verify Engine] Updated holder ages for ${output.length} users.`
                );
            }

            return output.length;
        } catch (error) {
            console.warn(
                '[Verify Engine Warning] Holder-age calculation failed:',
                error?.message || error
            );
            return 0;
        } finally {
            if (attached) {
                try {
                    holdersDb.prepare('DETACH DATABASE txdb').run();
                } catch {
                    // Ignore detach errors during shutdown.
                }
            }
            holdersDb.close();
        }
    }
}

module.exports = HolderAgeCalculator;
