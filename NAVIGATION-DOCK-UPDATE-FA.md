# گزارش تغییر ناوبری و جایگاه اتصال کیف پول

## تغییرات

- نوار ناوبری به Dock پایین صفحه با آیتم‌های Home، Market، Token، Create، Holders، More و Profile تبدیل شد.
- دکمهٔ Create در مرکز Dock برجسته شده است.
- مقصد Profile به manifest ناوبری مشترک اضافه شد و وضعیت فعال آن بر اساس مسیر `/profile` تعیین می‌شود.
- لوگوی Maze از داخل Navigation خارج و به گوشهٔ بالا-چپ منتقل شد.
- کنترل‌های Game View و Theme خارج از Dock و در گوشهٔ بالا-راست قرار گرفتند.
- دکمهٔ اتصال کیف پول از ناوبری حذف و در مرکز صفحهٔ Profile قرار گرفت؛ این دکمه فقط در وضعیت `anonymous` نمایش داده می‌شود.
- گزینه‌های غیرفعال قبلی Competitions، Leaderboard و How to Play در منوی More حفظ شدند.
- موقعیت Navigation در صفحهٔ Maze همچنان در جریان بالای صفحه باقی مانده تا رفتار محیط بازی تغییر نکند.

## قسمت‌های محافظت‌شده

منطق اتصال کیف پول، بارگذاری تنبل Reown، احراز هویت SIWS، مدیریت ورود/خروج، APIهای برنامه، مسیرهای بازی، Simulation، Game Loop و WebSocket بازنویسی نشدند.

## اعتبارسنجی

- `node scripts/check-layout.mjs`: موفق
- `node scripts/check-css-duplicates.mjs`: موفق؛ ۱۸ stylesheet فعال بررسی شد.
- بررسی نحوی TypeScript/TSX با `transpileModule`: موفق برای چهار فایل TS/TSX تغییرکرده یا مرتبط.
- `tsc --project tsconfig.json --noEmit`: اجرا تا مرحلهٔ بررسی پروژه متوقف شد؛ فایل ZIP فاقد type definitionهای `node` و `vite/client` است.
- تست Identity اجرا نشد؛ وابستگی `better-sqlite3` در محیط موجود نیست.
- Vite Build و تست مرورگر اجرا نشدند؛ `node_modules` در آرشیو موجود نیست.
