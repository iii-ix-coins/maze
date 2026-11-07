'use strict';

class PriceAnalyzer {
    constructor(dbInstance) {
        this.db = dbInstance;
    }

    calculateChanges(currentRecord) {
        const latestTimeMs = new Date(currentRecord.timestamp).getTime();
        const currentPrice = currentRecord.priceUsd;

        const intervals = {
            '1m': 60 * 1000,
            '5m': 5 * 60 * 1000,
            '30m': 30 * 60 * 1000,
            '1h': 60 * 60 * 1000,
            '6h': 6 * 60 * 60 * 1000,
            '12h': 12 * 60 * 60 * 1000,
            '24h': 24 * 60 * 60 * 1000,
            '7d': 7 * 24 * 60 * 60 * 1000,
            '30d': 30 * 24 * 60 * 60 * 1000,
            '180d': 180 * 24 * 60 * 60 * 1000,
            '365d': 365 * 24 * 60 * 60 * 1000
        };

        const changes = {};

        for (const [key, ms] of Object.entries(intervals)) {
            const targetTimeMs = latestTimeMs - ms;

            // تلرانس: نهایتاً ۱۰٪ از کل بازه اجازه خطا داریم 
            // حداقل ۵ ثانیه را برای بازه‌های کوتاه (مثل ۱ دقیقه) در نظر می‌گیریم
            const maxDiffMs = Math.max(ms * 0.10, 5000);

            // پاس دادن بازه مجاز به دیتابیس
            const pastRecord = this.db.findClosestRecord(targetTimeMs, maxDiffMs);

            if (pastRecord && pastRecord.priceUsd > 0) {
                const pastPrice = pastRecord.priceUsd;
                const percentChange = ((currentPrice - pastPrice) / pastPrice) * 100;
                changes[key] = Number(percentChange.toFixed(4));
            } else {
                changes[key] = null; // داده‌ای با این دقت یافت نشد
            }
        }

        return changes;
    }
}

module.exports = PriceAnalyzer;
