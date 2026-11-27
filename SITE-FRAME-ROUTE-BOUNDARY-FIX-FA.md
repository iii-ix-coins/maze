# گزارش اصلاح ریشه‌ای پایداری سه قاب سایت

## نشانه

پس از مشاهدهٔ صفحات مهمان و سپس جابه‌جایی از مسیر Create در `/maze.html` به صفحهٔ عادی، قاب مرکزی صفحات عادی ناپدید می‌شد؛ در نتیجه بعد از ورود نیز قاب محتوای Home و سایر صفحات دیده نمی‌شد. در دو تصویر همراه نسخهٔ `maze-main(2).zip`، قاب Header و Dock باقی مانده بود اما Border قاب مرکزی صفحهٔ عادی وجود نداشت.

## علت ریشه‌ای

1. `index.html` پیش از اجرای React، برای مسیرهای Maze کلاس `body.in-menu` را synchronously اضافه می‌کند.
2. در حالت مهمان، `MazeFrame` به‌جای `MazePage`، کامپوننت `PageAccessGate` را نمایش می‌دهد؛ در نتیجه `MazeMenu` اصلاً Mount نمی‌شود و cleanup آن برای حذف `body.in-menu` وجود ندارد.
3. در `navigation.ts` بررسی `soft` فقط مقصد را کنترل می‌کرد. بنابراین خروج از سند مستقل Maze به مسیر عادی می‌توانست با `pushState` انجام شود و body همان سند با `in-menu` باقی بماند.
4. CSS قاب Route، قاب و scroller را با `body:not(.in-menu)` محدود کرده بود. باقی‌ماندن کلاس باعث غیرفعال شدن Border و هندسهٔ قاب مرکزی می‌شد.

## اصلاحات

### 1. مالکیت چرخهٔ عمر در MazeFrame

`src/features/maze/MazeFrame.tsx` هنگام unmount همهٔ کلاس‌های سندی Maze (`in-menu`, `wide`, `spectating`) را حذف می‌کند. این پاک‌سازی در والد قاب انجام می‌شود؛ بنابراین چه کاربر مهمان باشد و چه `MazeMenu` اصلاً Mount نشده باشد، حالت سند آزاد می‌شود.

### 2. مرز سخت ناوبری Maze در هر دو جهت

`src/app/routes.ts` دو تابع `isSoftNavigationPath` و `canSoftNavigateBetween` دارد. ناوبری SPA فقط وقتی مجاز است که هم مسیر مبدأ و هم مقصد در مجموعهٔ مسیرهای `soft` باشند.

- ورود از صفحات عادی به `/maze.html` یا `/play`: document navigation
- خروج از `/maze.html` یا `/play` به صفحات عادی: document navigation
- Back/Forward بین این دو نوع سند: reload روی URL مقصد
- حرکت بین Home، Explore، Maze Hub و Profile: همچنان SPA navigation

این مرزبندی همچنین مانع باقی‌ماندن runtime مستقل Maze پس از حذف قاب آن از React tree می‌شود.

### 3. استقلال CSS قاب Route از body mode

در `src/styles/site.css`، قواعد `.route-page`، `::before`، `feature-page-shell` و scrollbar دیگر به `body:not(.in-menu)` وابسته نیستند. وجود یا عدم وجود قاب توسط خود عنصر `.route-page` تعیین می‌شود. مسیر Maze همچنان از Portal و `#mazeApp` استفاده می‌کند و `AppRouter` برای آن Route Frame عادی ایجاد نمی‌کند.

### 4. تست رگرسیون

- تست مسیرها برای جلوگیری از soft navigation در هر دو جهت مرز Maze اضافه شد.
- `scripts/check-layout.mjs` استقلال CSS قاب Route از `body.in-menu` و cleanup والد MazeFrame را کنترل می‌کند.
- مستندات Maze و Navigation به‌روزرسانی شدند.

## محدودهٔ محافظت‌شده

هیچ تغییری در Game Loop، Simulation، الگوریتم‌ها، Canvas Rendering، WebSocket protocol، Room Store، API یا Backend ایجاد نشد. تغییرات فقط چرخهٔ عمر قاب، مرز ناوبری سند و CSS قاب‌های سایت را هدف می‌گیرند.

## اعتبارسنجی این بسته

- `node scripts/check-css-duplicates.mjs`: موفق؛ ۲۰ فایل CSS بدون selector/property تکراری.
- `node scripts/check-svg-theme.mjs`: موفق؛ سه SVG پس‌زمینهٔ Maze مفقود، هشدارهای قدیمی نسخهٔ پایه هستند.
- `node --check scripts/check-layout.mjs`: موفق.
- کنترل جدید رگرسیون قاب و مرز ناوبری در `check-layout` قبل از بخش کنترل Dock عبور می‌کند؛ اسکریپت بعداً روی assertion قدیمی Dock متوقف می‌شود (`site.css must own the six-item dock...`) که خارج از این تغییر است.
- Syntax فایل‌های TypeScript/TSX با TypeScript `transpileModule` بررسی شده است. Typecheck کامل، Vite Build و تست مرورگر در این محیط انجام نشده‌اند؛ `node_modules` در ZIP وجود ندارد.
