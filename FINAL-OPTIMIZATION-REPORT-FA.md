# گزارش نهایی بهینه‌سازی Maze Site

## تغییرات اعمال‌شده

- ناوبری داخلی صفحات عادی همگام شده است؛ گیت `busy`، انیمیشن خروج/ورود طولانی و انتظار readiness از مسیر جابه‌جایی حذف شده‌اند. کلیک‌ها دیگر در زمان busy بی‌صدا دور انداخته نمی‌شوند.
- صفحه پس از bootstrap حیاتی فوراً نمایش داده می‌شود؛ انتظار تا ۸ ثانیه‌ای برای تکمیل فونت/تصویر/API از مسیر نمایش اولیه حذف شده و داده‌ها تدریجی بارگذاری می‌شوند.
- Build تولیدی اکنون فقط یک ورودی HTML (`index.html`) دارد. سرور مسیرهای `/token`، `/holders`، `/market` و معادل‌های `.html` را به همان SPA برمی‌گرداند تا refresh و deep-link کار کند.
- صفحات Home، Coin، Holders و Market به‌صورت route-level lazy chunk بارگذاری می‌شوند.
- CSS اختصاصی Maze، Home و صفحات Feature از CSS اولیه خارج و به chunk صفحه مربوط منتقل شده‌اند.
- AppKit و Solana adapter فقط با اولین درخواست کاربر برای اتصال کیف پول بارگذاری می‌شوند.
- پاسخ‌های JSON متنی بزرگ با gzip بومی Node فشرده می‌شوند؛ برای این کار dependency جدید اضافه نشده است.
- فایل‌های public در production با cache هفت‌روزه و فایل‌های hashدار build با cache یک‌ساله و immutable سرو می‌شوند.
- پاسخ‌های feed و stats هدر کوتاه `max-age=2, stale-while-revalidate=10` می‌گیرند.
- خواندن snapshotهای JSON با cache مبتنی بر `mtime` و اندازه فایل انجام می‌شود.
- خروجی Top Holders برای سه ثانیه cache می‌شود تا SQLite همگام برای هر درخواست دوباره query نشود.
- polling آمار، Holder و Market در تب مخفی متوقف و هنگام بازگشت تب دوباره اجرا می‌شود.
- حلقه RAF بازی در تب مخفی متوقف می‌شود و با بازگشت تب دوباره شروع می‌شود.
- محاسبه heat هولدرها از O(n²) به O(n) تبدیل شده؛ ردیف‌ها memo شده‌اند و `aria-live` از لیست ۱۰۰تایی برداشته شده است.
- تغییر تم از View Transitions استفاده می‌کند، transition طولانی background حذف شده و همگام‌سازی دو کلید تم بین تب‌ها اصلاح شده است.
- مسیر runtime state به `.gitignore` اضافه شده است.

## تصمیم‌های محافظه‌کارانه

- مسیر ورود/خروج Maze همچنان document navigation است. Engine فعلی تعدادی listener و RAF سراسری بدون API کامل dispose دارد؛ soft-navigation کردن آن در این مرحله می‌تواند پس از خروج از Maze باعث loop یا listener تکراری شود. CSS و bundle Maze lazy شده‌اند، اما تبدیل کامل lifecycle موتور به mount/unmount مستقل نیازمند مرحله جداگانه است.
- حلقه Maze هنگام مخفی بودن تب متوقف می‌شود؛ dirty-flag کامل برای توقف رندر در منو/حالت پایان بازی هنوز اعمال نشده، چون باید تمام مسیرهای mutation و انیمیشن بازی علامت‌گذاری شوند.
- SSE، مهاجرت به TanStack Query، سخت‌گیری کامل TypeScript و حذف انبوه exportها/assetهای مشکوک اعمال نشده‌اند. موارد حذف با grep ساده کافی نیستند؛ برای جلوگیری از حذف مسیرهای پویا و مسیر rollback، پاک‌سازی destructive به build و تست کامل نیاز دارد.
- فایل `maze-routes.ts` در واقع توسط `MazeLink.tsx` مصرف می‌شود و عمداً حذف نشده است.

## بررسی انجام‌شده و محدودیت محیط

- `node --check` برای فایل‌های JavaScript و اسکریپت‌های MJS موفق بود.
- `node scripts/check-layout.mjs` موفق بود.
- بررسی مسیر importهای نسبی انجام شد؛ تنها مورد `./x.css` در declaration مربوط به wildcard محیط Maze بود.
- نصب وابستگی‌ها با `npm ci` در محیط اجرا timeout شد؛ بنابراین Vite production build، TypeScript typecheck و تست‌های Vitest در این محیط قابل اجرا نبودند. این ZIP شامل سورس اصلاح‌شده است، نه خروجی build تولیدی.

## فرمان‌های تأیید نهایی در محیط استقرار

```bash
npm ci
npm run check
```

پس از موفقیت `npm run check`، خروجی build در `dist/site` آماده سرو توسط `server.js` خواهد بود.
