# گزارش ارتقای ساختاری Maze

## تغییرات انجام‌شده در این نسخه

1. افزودن `src/app/page-readiness.ts` برای مدیریت آمادگی صفحه با ثبت کارهای اولیه ضروری، انتظار محدود، فونت‌ها و تصاویر قابل مشاهده.
2. اتصال Navigation به چرخه آمادگی صفحه؛ Loader اکنون قبل از ورود صفحه منتظر کارهای اولیه ثبت‌شده می‌ماند و سپس حداقل زمان نمایشی قبلی را حفظ می‌کند.
3. اتصال درخواست اولیه Market، Holders و Live Feed به readiness؛ pollingهای بعدی و درخواست‌های دائمی مانع نمایش صفحه نمی‌شوند.
4. Provider بارگذاری اولیه نیز قبل از حذف Loader منتظر readiness می‌ماند؛ آماده‌شدن Maze همچنان از خود MazePage و پس از راه‌اندازی Engine اعلام می‌شود.
5. بازیابی لایه سه تصویر پس‌زمینه Maze در `MazeBackground.tsx`؛ مسیر دوربین و منطق ذخیره‌سازی آن تغییر داده نشده‌اند.
6. اصلاح `scripts/check-layout.mjs` تا مالکیت فعلی MazeBackground در `App.tsx` را بررسی کند، نه محل معماری قبلی در SiteChromeHosts.
7. افزودن سند معماری مقیاس‌پذیری، مرزهای آینده Identity و Wallet و الزامات امنیتی آن‌ها.

## مواردی که عمداً تغییر نکردند

- قراردادها و payloadهای API موجود
- پروتکل WebSocket Maze و نسخه 2 آن
- Game Loop، Simulation، الگوریتم‌ها و Room state
- منطق Backend، دیتابیس‌ها و سرویس‌های فعلی
- طراحی ظاهری صفحات، CSS و زمان‌بندی انیمیشن‌های Navigation
- اتصال واقعی کیف پول یا ساخت حساب کاربری؛ این‌ها بدون Backend امن و تصمیمات امنیتی نباید mock شوند.

## اعتبارسنجی انجام‌شده

- `node scripts/check-layout.mjs`: موفق
- `node --check scripts/check-layout.mjs`: موفق
- `node --check server.js`: موفق
- `npm run typecheck`: اجرا شد اما به علت نصب نبودن وابستگی‌ها متوقف شد؛ TypeScript اعلام کرد type definitions مربوط به `node` و `vite/client` در محیط موجود نیستند.
- Production build و تست‌های Vitest/maze اجرا نشدند؛ چون `node_modules` در ZIP موجود نبود.

## محدودیت ظرفیت

این تغییر ZIP به‌تنهایی پروژه را برای یک میلیارد اتصال هم‌زمان آماده نمی‌کند. Maze server در نسخه فعلی state اتاق‌ها و اتصال‌ها را در حافظه یک process نگه می‌دارد و محدودیت‌های محلی 2000 اتصال و 400 اتاق دارد. اجرای چند replica بدون Room ownership توزیع‌شده، registry مشترک و pub/sub امن نیست. سند `docs/PLATFORM-SCALE-READINESS-FA.md` معماری هدف، گلوگاه‌های فعلی و مراحل مهاجرت را شرح می‌دهد.

## دستورهای پیشنهادی پس از نصب وابستگی‌ها

```bash
npm ci
npm run check:layout
npm run typecheck
npm run build:all
npm run test:all
```
