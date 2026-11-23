# گزارش تغییرات Navigation و Explore — Maze

مبنای کار: فایل `maze-main.zip` ارسال‌شده در همین گفتگو.

## تغییرات رابط کاربری

1. کنترل سه‌گزینه‌ای بالای صفحه (`Create / Rooms / Live`) و کامپوننت `GameViewSwitcher` از Site Chrome حذف شد. `ThemeSwitcher` در بالا-راست باقی ماند.
2. دکمهٔ `Create` در Dock پایین حفظ شد و همچنان به `MAZE_VIEW_URLS.create` متصل است. وضعیت فعال آن نیز فقط برای نمای Create نمایش داده می‌شود، نه هنگام مشاهدهٔ Live یا Rooms.
3. گزینه‌های `Market` و `Token` از Dock حذف و یک گزینهٔ `Explore` جایگزین آن‌ها شد. ترتیب فعلی Dock: `Home / Explore / Create / Holders / More / Profile`.
4. صفحهٔ جدید `/explore` ساخته شد. در آن دو گزینهٔ `Live Races` و `Rooms` به‌صورت کارت قابل انتخاب هستند.
5. گزینه‌های Live و Rooms به همان مسیرهای موجود `MAZE_VIEW_URLS.live` و `MAZE_VIEW_URLS.rooms` متصل‌اند. تب‌ها و محتوای فعلی Maze و منطق Room Store، Live و Engine بازنویسی نشده‌اند.

## حذف صفحات

- مسیرهای `/token` و `/coin.html` از route manifest حذف شدند.
- مسیرهای `/market` و `/market.html` از route manifest حذف شدند.
- فایل‌های HTML مستقل `coin.html` و `market.html`، کامپوننت `CoinPage`، صفحهٔ مستقل `MarketPage` و استایل‌های اختصاصی این صفحات حذف شدند.
- فایل‌های اختصاصی Game View Switcher و آیکون‌های استفاده‌نشدهٔ آن نیز حذف شدند.

## بخش‌های حفظ‌شده

- Market Summary فشردهٔ Home عمداً باقی مانده است؛ چون Home هنوز از `MarketSummary` و `useMarketData` استفاده می‌کند. به همین علت APIهای مشترک بازار و منطق Backend دست‌کاری نشده‌اند.
- صفحهٔ Holders، Profile، Wallet، Theme، Create Wizard، تب‌های داخلی Maze، Game Engine، Simulation، Room Store و WebSocket در این تغییر بازنویسی نشده‌اند.

## آزمون‌ها و اعتبارسنجی

- `node scripts/check-layout.mjs`: موفق.
- `node scripts/check-css-duplicates.mjs`: موفق؛ ۱۸ فایل CSS فعال، بدون selector/property/keyframe تکراری گزارش‌شده.
- بررسی نحو TS/TSX با TypeScript `transpileModule` برای ۵ فایل تغییریافته: موفق.
- بررسی PostCSS برای CSSهای تغییریافته: موفق.
- `node --check` برای `server.js`، `start.js` و `scripts/check-layout.mjs`: موفق.
- اعتبارسنجی JSON در `shared/site-routes.json`: موفق.
- Typecheck کامل با `tsc --project tsconfig.json --noEmit` اجرا نشد؛ محیط فاقد type definitions مربوط به `node` و `vite/client` است.
- Vite production build و آزمون بصری مرورگر در این محیط اجرا نشده‌اند؛ `node_modules` در ZIP وجود ندارد.

## مسیرهای اصلی

- Dock: `src/components/navigation/SiteNavigation.tsx`
- Site Chrome: `src/components/layout/SiteChromeHosts.tsx`
- Explore: `src/features/explore/ExplorePage.tsx`
- Route manifest: `shared/site-routes.json`
- Route dispatch: `src/app/router.tsx`
