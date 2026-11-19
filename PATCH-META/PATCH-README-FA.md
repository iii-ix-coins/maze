# پچ حذف TX Engine، Verify Engine و Last 100 Purchases

این بسته فقط فایل‌های تغییر‌یافته را با مسیر اصلی آن‌ها نگه می‌دارد؛ ساختار کامل پروژه نیست.

## روش اعمال

1. محتویات ZIP را مستقیماً در ریشه Repository استخراج کنید و فایل‌های موجود را جایگزین کنید. فایل‌های اصلاحی در ZIP از ریشه مسیرهای پروژه شروع می‌شوند؛ مستندات و ابزار حذف داخل پوشه `PATCH-META/` هستند.
2. موارد `PATCH-META/DELETE-MANIFEST.txt` را از Repository حذف کنید. برای حذف امن و دقیق می‌توانید از اسکریپت همراه پچ استفاده کنید:
   `powershell -ExecutionPolicy Bypass -File .\PATCH-META\apply-delete-manifest.ps1 -ProjectRoot "C:\path\to\maze"`
   این اسکریپت فقط همان دو پوشه و سه فایل فهرست‌شده را در ریشه پروژه حذف می‌کند. اجرای آن اختیاری است؛ فهرست کامل در `PATCH-META/DELETE-MANIFEST.txt` قرار دارد.
3. تغییرات را بررسی و Commit کنید.
4. وابستگی‌ها را نصب و تست‌ها را اجرا کنید:
   - `npm ci`
   - `npm run check`

## موارد حذف‌شده

- پردازشگرهای Transaction و Verify از `start.js` و Process Manager.
- TX Engine و Verify Engine به‌طور کامل.
- APIهای `/api/live-feed/buyers`، `/api/latest-buyers` و `/api/tx-state`.
- منبع داده `transactions.db` و enrichment خرید در Live Feed.
- نمایش آخرین خریدها و ستون‌های `Buys` و `Last buy` در Top Holders.
- فایل‌های state و diagnostic اختصاصی TX.
- تنظیمات `TX_*`، `TX_WS_*`، `VERIFY_*` و کلید قدیمی `HELIUS_API_KEYS` از `.env.example`.

## پاک‌سازی دیتابیس‌های موجود

`engines/holder-engine/lib/db.js` به schema version 8 ارتقا یافته است. در اولین اجرای Holder Engine بعد از Deploy، migration به‌صورت تراکنشی این اشیاء قدیمی را حذف می‌کند:

- view: `holder_profile`
- table: `holder_verification`
- table: `holder_purchase_stats`
- index: `idx_holder_verification_state`

اطلاعات اصلی Holderها، رتبه‌بندی، Snapshotها، صف classification و آمار تعامل حذف نمی‌شوند.

## مواردی که عمداً حفظ شده‌اند

- Holder Engine و فرآیند تشخیص/classification کیف پول‌ها.
- PCLQCH/Price Engine و Jupiter Market Engine.
- Interaction Engine.
- Maze Multiplayer / WebSocket.
- آمار تجمیعی Buy/Sell و Net Buyers که از Jupiter Market API می‌آیند؛ این داده‌ها وابستگی به TX Engine حذف‌شده ندارند.

## وابستگی‌های npm

`package.json` و `package-lock.json` عمداً تغییر نکرده‌اند. بررسی importها نشان داد تمام dependencyهای runtime ریشه هنوز در بخش‌های باقی‌مانده استفاده می‌شوند؛ برای نمونه:

- `@solana/web3.js` و `@solana/spl-token`: Holder Engine و PCLQCH.
- `better-sqlite3`: Holder، Price/Jupiter Market و Interaction.
- `axios` و `decimal.js`: PCLQCH/Price Engine.
- `ws`: Maze Multiplayer و تست‌های آن.
- `express`, `dotenv`: سرورها و Engineهای باقی‌مانده.

حذف این packageها باعث شکستن بخش‌های فعال می‌شود.

## Variables در Railway

بعد از Deploy، متغیرهای TX/Verify قدیمی را از سرویس اصلی حذف کنید. متغیرهای مهم قدیمی عبارت‌اند از:

- `TX_FETCH_MODE`, `TX_RPC_BATCH_ENABLED`, `TX_DELAY_MS`, `TX_LIMIT`, `TX_BATCH_SIZE`, `TX_BATCH_DELAY_MS`, `TX_FETCH_DELAY_MS`, `TX_RETRY_LIMIT`, `TX_RETRY_BASE_DELAY_MS`, `TX_REQUEST_TIMEOUT_MS`, `TX_CONCURRENCY`, `TX_BATCH_CONCURRENCY`, `TX_WRITER_BUFFER_SIZE`, `TX_SCAN_INTERVAL`, `TX_CACHE_MAX_ENTRIES`, `TX_PARSED_EVENTS_MIN_INTERVAL_MS`, `TX_SIGNATURE_PAGE_SIZE`
- `TX_WS_ENABLED`, `TX_WS_URL`, `TX_WS_MAX_RECONNECT_ATTEMPTS`, `TX_WS_MAX_SUPPORTED_TRANSACTION_VERSION`, `TX_WS_403_COOLDOWN_MS`
- `VERIFY_FAST_RETRY_MS`, `VERIFY_INTERVAL_MS`
- `HELIUS_API_KEYS` (جمع)

`HELIUS_API_KEY` (مفرد) را حذف نکنید؛ Holder Engine فعلی همچنان از آن پشتیبانی می‌کند. اگر به‌جای آن `RPC_URL` معتبر دارید، این کلید می‌تواند اختیاری باشد.

اگر Railway Volume قدیمی شامل دیتابیس TX باشد، فایل آن دیگر در کد استفاده نمی‌شود. پیش از حذف فایل‌های قدیمی Volume، از آن‌ها Backup بگیرید؛ حذف Source به‌تنهایی فایل‌های باقی‌مانده در Volume را پاک نمی‌کند.
