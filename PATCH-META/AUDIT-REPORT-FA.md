# گزارش پاک‌سازی TX Engine، Verify Engine و Last 100 Purchases

## خلاصه

بر مبنای `maze-site.zip`، دو Engine از فرایند اجرا و کد حذف شدند و زنجیره داده خریدهای انفرادی نیز از API تا UI برداشته شد.

## زنجیره‌هایی که حذف شدند

1. `start.js` دیگر TX Engine و Verify Engine را راه‌اندازی یا Restart نمی‌کند.
2. تمام سورس‌های `engines/tx-engine/` و `engines/verify-engine/` حذف شدند.
3. `shared/services/LiveFeedService.js` دیگر `transactions.db` را باز نمی‌کند و فقط Snapshot مربوط به Top 100 Holders را می‌خواند.
4. APIهای buyers و tx-state از `server.js` و `shared/api-routes.json` حذف شدند.
5. state files و ابزار diagnostic مرتبط با TX حذف شدند.
6. Live Feed اکنون فقط Top 100 Holders را نمایش می‌دهد.
7. ستون‌های Buys و Last buy از جدول Holders، hook، مدل و CSS حذف شدند.
8. متدهای `getHolderProfile` و `upsertPurchaseStats` و statementهای مربوط از Holder DB حذف شدند.

## مهاجرت دیتابیس

Schema نسخه 8، به‌صورت migration تراکنشی، view/table/index قدیمی مربوط به verification/purchase را حذف می‌کند. جداول اصلی `holders_list`، `holder_rankings`، `holder_meta`، `holder_social_stats`، `classification_queue` و `holder_classification_history` حفظ می‌شوند.

## وابستگی‌های باقی‌مانده

هیچ dependency از `package.json` حذف نشد؛ بررسی importها نشان داد dependencyهای موجود در سایر Engineها، سرورها، فرانت‌اند یا تست‌های باقی‌مانده مصرف می‌شوند. `@solana/web3.js` و `@solana/spl-token` برای Holder/PCLQCH باقی می‌مانند؛ `better-sqlite3` برای سه subsystem فعال؛ و `ws` برای Multiplayer لازم است.

## اعتبارسنجی انجام‌شده

- `node scripts/check-layout.mjs`: موفق.
- `node scripts/check-css-duplicates.mjs`: موفق، 18 CSS فعال بررسی شدند.
- `node --check`: برای `start.js`، `server.js`، `shared/services/LiveFeedService.js`، `engines/holder-engine/lib/db.js` و `scripts/check-layout.mjs` موفق.
- TypeScript `transpileModule`: چهار TS/TSX تغییر‌یافته بدون خطای syntax Parse شدند.
- SQLite migration simulation: حذف اشیاء قدیمی از schema v7 به v8 انجام شد و جداول اصلی Holder باقی ماندند.
- `tsc --project tsconfig.json --noEmit`: اجرا نشد/ناموفق بود، چون `node_modules` در محیط بررسی نصب نبود و تعریف‌های `node` و `vite/client` پیدا نشدند.
- Production Build و اجرای Vitest/Maze tests تأیید نشده‌اند و باید پس از `npm ci` روی سیستم پروژه اجرا شوند.

## نکات حفظ‌شده

آمار تجمیعی Buy/Sell و Net Buyers از Jupiter Market API و نماهای مربوط به آن‌ها حذف نشده‌اند؛ این‌ها با feed خریدهای انفرادی TX Engine متفاوت‌اند. همچنین classification کیف‌پول در Holder Engine مستقل از Verify Engine حذف‌شده باقی مانده است.
