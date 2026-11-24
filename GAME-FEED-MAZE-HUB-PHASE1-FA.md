# گزارش پیاده‌سازی فاز اول Game Feed و Maze Hub

## هدف

جدا کردن سه مفهوم محصولی:

- **Home (`/`)**: فید بازی‌ها شامل مسابقات زنده، اتاق‌های قابل ورود و خلاصهٔ نتایج تازه.
- **Maze (`/maze`)**: هاب سبک Maze برای دسترسی به محتوای قبلی صفحهٔ Home و معرفی محیط بازی.
- **Create (`/maze.html?view=create`)**: ورود مستقیم به Wizard فعلی ساخت بازی.

## تغییرات انجام‌شده

### ۱. Route مستقل Maze Hub

در `shared/site-routes.json` مسیر نرم `/maze` با شناسهٔ `maze-hub` اضافه شد. این مسیر از SPA Router عبور می‌کند و موتور Maze را بارگذاری نمی‌کند.

مسیرهای `/maze.html` و `/play` بدون تغییر به‌عنوان سند اجرای موتور بازی باقی مانده‌اند و همچنان `soft: false` هستند.

### ۲. Navigation

در `src/components/navigation/SiteNavigation.tsx` دکمهٔ Maze اضافه شد و آیکون آن از `/css/images/nav/nav-maze.svg` خوانده می‌شود. نوع `NavIconName` و SVG fallback نیز `maze` را می‌شناسند.

ترتیب Dock اکنون Home، Explore، Maze، Create، Notifications، Profile و انتخاب‌گر Theme است. مقصد و منطق Create تغییر نکرده است.

### ۳. انتقال محتوای قبلی Home به Maze Hub

`MarketSummary` و `HomeHeroSlider` از Home خارج و در `src/features/maze/MazeHubPage.tsx` نمایش داده شدند. استایل مستقل Maze Hub در `src/features/maze/maze-hub.css` قرار دارد تا بارگذاری مستقیم `/maze` نیز استایل صفحه را همراه خود داشته باشد.

### ۴. Home به‌عنوان Game Feed

`src/features/home/HomePage.tsx` اکنون بخش‌های زیر را نمایش می‌دهد:

- Live games: اتاق‌هایی با فاز `playing`.
- Open rooms: اتاق‌هایی با فاز `waiting` و ظرفیت خالی.
- Just finished: خلاصهٔ نتایج تازهٔ مسابقات.

فیلترهای For you، Live، Open rooms و Finished و دکمهٔ Refresh نیز اضافه شده‌اند.

### ۵. اتصال به داده‌های موجود سرور

`src/features/home/game-feed-api.ts` از endpoint فقط‌خواندنی `GET /rooms` استفاده می‌کند. این endpoint در `engines/maze-server/src/http.ts` از قبل وجود داشت و Snapshot شامل `rooms`، `recent` و `counts` را بازمی‌گرداند.

صفحه هر ۱۰ ثانیه Snapshot را تازه می‌کند، هنگام مخفی بودن تب درخواست دوره‌ای متوقف می‌شود و با بازگشت کاربر Refresh انجام می‌شود. برای جلوگیری از ساخت ارتباط موازی، Home WebSocket جداگانه‌ای ایجاد نمی‌کند و به پروتکل یا Game Loop دست نمی‌زند.

### ۶. آدرس سرویس در محیط Production

در Build سایت، مقدار `MAZE_PUBLIC_URL` به meta tag با نام `maze-multiplayer-url` تزریق می‌شود. فید از origin این مقدار، آدرس HTTP(S) مربوط به `/rooms` را استخراج می‌کند.

برای سرویس‌های جداگانه در Production باید مقدار `MAZE_PUBLIC_URL` در محیط Build سرویس سایت تنظیم شود؛ نمونه:

```env
MAZE_PUBLIC_URL=wss://<maze-server-public-domain>
```

در توسعهٔ Vite، درخواست `/rooms` از Proxy موجود به `http://127.0.0.1:8081` می‌رود.

## محدودیت‌های صریح این فاز

1. `recent` فعلی آرشیو دائمی نیست. سرور فقط تعداد محدودی نتیجهٔ نهایی را برای مدت کوتاه در حافظه نگه می‌دارد (`RECENT_MAX` و `RECENT_TTL_MS`).
2. کارت‌های Finished در این مرحله خلاصهٔ نتیجه هستند، نه ویدئو یا Replay قابل پخش.
3. Event Recorder، ذخیره‌سازی دائمی Replay، Like، Comment، Save، Follow و Ranking شخصی‌سازی‌شده هنوز پیاده‌سازی نشده‌اند.
4. کارت‌های فعلی از دادهٔ واقعی اتاق و نتیجه استفاده می‌کنند، ولی تصویر گرافیکی کارت یک Preview تزئینی رابط است؛ Live Canvas یا thumbnail پایدار هنوز به Game Feed متصل نشده است.
5. شمارنده‌ها و نتایج فقط به اندازهٔ داده‌ای که endpoint موجود ارائه می‌کند معتبر هستند؛ این فاز سیستم تحلیلی جدیدی ایجاد نمی‌کند.

## نکات حفظ سازگاری

- مسیر سند موتور Maze تغییر نکرد.
- Create همچنان `/maze.html?view=create` را باز می‌کند.
- Room join همچنان از Query فعلی `room` استفاده می‌کند.
- Live Races همچنان به View فعلی Maze متصل است.
- WebSocket protocol، Room Store، Simulation، Game Loop و الگوریتم‌های Maze تغییر نکردند.
- برای Home هیچ WebSocket یا Game Engine دوم ساخته نشده است.

## آزمون‌ها

موفق:

- `node scripts/check-layout.mjs`
- `node scripts/check-css-duplicates.mjs` (۲۰ فایل CSS فعال)
- `node --check server.js`
- `node --check start.js`
- بررسی JSON و یکتایی مسیرهای Route Manifest

اجرا نشد:

- TypeScript typecheck؛ پکیج‌های type definition برای `node` و `vite/client` در محیط نصب‌شده موجود نیستند.
- Vite production build؛ فرمان `vite` در `node_modules` موجود نیست.
- Vitest؛ وابستگی `vitest` نصب نشده است.
- تست بصری در مرورگر و تست یکپارچه با سرور آنلاین انجام نشده است.
