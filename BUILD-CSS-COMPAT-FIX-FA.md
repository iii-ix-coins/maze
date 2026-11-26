# گزارش اصلاح خطای Build در Railway

## علت خطا

در لاگ Railway مربوط به 2026-11-26، دستور `vite build` با موفقیت تمام شده بود (`built in 1.85s`). شکست در مرحلهٔ بعدی دستور `build:all` رخ داده است؛ یعنی اجرای `scripts/check-css-compat.mjs`.

این کنترل، وجود تابع `color-mix()` را در همهٔ فایل‌های CSS منبع و CSS تولیدشده ممنوع می‌کند. فایل تازه‌افزوده‌شدهٔ `src/components/access/page-access-gate.css` تعداد زیادی `color-mix()` وابسته به متغیرهای CSS داشت و به همین دلیل کنترل سازگاری، Build را با `exit code: 1` متوقف کرد.

هشدارهای `TOLERATED_TRANSFORM` دربارهٔ BigInt در وابستگی‌های WalletConnect / Reown خطای مسدودکننده نبودند. خطای نهایی مشخص‌شده در لاگ، همان دو گزارش `[css-compat]` است.

## اصلاح انجام‌شده

- تمام `color-mix()`های فایل `page-access-gate.css` به `rgba()` با توکن‌های RGB معنایی تبدیل شدند.
- برای حفظ رنگ و شفافیت در سه تم Light، Dark و Grass، توکن‌های زیر به `src/styles/theme-tokens.css` افزوده شدند:
  - `--ar-line-rgb`
  - `--ar-fill-rgb`
  - `--ar-hot-rgb`
- برای Accent از توکن موجود `--ar-rgb` استفاده شد.
- هیچ تغییری در منطق احراز هویت، Router، Wallet، Game Engine یا Backend انجام نشد.

## اعتبارسنجی

- بررسی کل مخزن: هیچ `color-mix()` در فایل‌های CSS باقی نمانده است.
- تجزیهٔ CSS هر دو فایل تغییرکرده با `tinycss2`: موفق.
- اجرای کامل `npm run build:all` در محیط اصلاح محدود انجام نشد؛ نصب وابستگی‌ها با `npm ci` در محیط اجرا به timeout رسید. بنابراین Build موفق ادعا نمی‌شود.

پس از دریافت بسته، اجرای `npm ci` و سپس `npm run build:all` در محیط Node تعریف‌شدهٔ پروژه (نسخهٔ `.nvmrc`) برای تأیید نهایی لازم است.
