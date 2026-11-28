# اصلاح فضای خالی و یکسان‌سازی Padding قاب محتوا

مبنای این اصلاح: `pro1-maze.zip` ارسالی کاربر در 2026-11-28.

## علت ریشه‌ای فضای خالی در حالت Logout

- `AppRouter` از قبل `RouteScrollbar` را هنگام `isAccessView` از درخت React خارج می‌کرد؛ پس خود Scrollbar سفارشی علت باقی‌ماندن فاصله نبود.
- در `src/styles/site.css` قانون اولیه‌ی `.route-page>.feature-page-shell--access` قبل از قانون پایه‌ی `.route-page>.feature-page-shell` قرار داشت.
- هر دو Selector Specificity یکسان داشتند. در نتیجه قانون پایه که بعدتر آمده بود، `overflow-y: auto` و مهم‌تر از آن `padding-inline-end` عمومی را دوباره اعمال می‌کرد.
- مقدار سمت راست از gutter مخصوص Scrollbar محاسبه می‌شد، حتی زمانی که RouteScrollbar اصلاً Mount نشده بود.

## تغییرات انجام‌شده

### `src/styles/site.css`

- سه قرارداد جداگانه‌ی padding عمودی، شروع افقی و پایان افقی حذف شدند.
- یک توکن واحد تعریف شد:

  `--site-frame-content-padding: calc(var(--site-scrollbar-inset) + var(--site-scrollbar-hit-width));`

- این مقدار با `padding: var(--site-frame-content-padding)` روی `.feature-page-shell` اعمال می‌شود؛ بنابراین بالا، راست، پایین و چپ همیشه دقیقاً برابرند و در Login و Logout با تغییر وضعیت هویت عوض نمی‌شوند.
- مقدار توکن از هندسه‌ی واقعی محدوده‌ی تعاملی Scrollbar محاسبه می‌شود؛ بنابراین در صفحات دارای Scrollbar، ناحیه‌ی تعاملی آن وارد محتوای اصلی نمی‌شود.
- قانون Access به بعد از قانون پایه منتقل و با Selector پرقدرت‌تر تعریف شد:

  `.route-page > .feature-page-shell.feature-page-shell--access`

  در این حالت `overflow: hidden` واقعاً برنده‌ی Cascade است و باکس مهمان Scroll نمی‌شود.
- `RouteScrollbar` در Access View همچنان Mount نمی‌شود. این بخش از Router در نسخه‌ی مبنا درست بود و تغییر Runtime لازم نداشت.

### `scripts/check-layout.mjs`

- آزمون معماری اکنون قرارداد padding چهارطرفه‌ی واحد را کنترل می‌کند.
- آزمون بررسی می‌کند قانون Access بعد از قانون پایه قرار گرفته باشد تا خطای Cascade دوباره برنگردد.
- آزمون عدم Mount شدن RouteScrollbar در Access View اضافه/هماهنگ شد.
- چند تطبیق متنی قدیمی که با JSX واقعی نسخه‌ی مبنا (کلاس شرطی روی main) و فاصله‌گذاری Selectorهای CSS هماهنگ نبودند، اصلاح شدند؛ این‌ها فقط تست‌های ایستا هستند و رفتار Runtime را تغییر نمی‌دهند.

## موارد عمداً دست‌نخورده

- `AppRouter` و شرط `isAccessView` از نظر رفتار؛ چون از قبل درست بودند.
- `RouteScrollbar` و منطق Drag/Wheel/ResizeObserver.
- Layout داخلی `PageAccessGate` و padding خود کارت.
- Header، Dock، Motion Orchestrator، Wallet، Maze Engine، WebSocket و Backend.

## اعتبارسنجی

موفق:
- `node --check scripts/check-layout.mjs`
- `node scripts/check-layout.mjs`
- `node scripts/check-css-duplicates.mjs` (۲۰ فایل CSS فعال)
- `node scripts/check-svg-theme.mjs`
- `node --test tests/identity/identity-bootstrap.test.cjs` (۳ تست)

محدودیت محیط:
- `node_modules` در ZIP موجود نبود.
- تست `identity-routes` به‌علت نصب‌نبودن `better-sqlite3` اجرا نشد.
- Typecheck و Vite Production Build به‌علت نصب‌نبودن وابستگی‌های پروژه در این محیط اجرا نشدند.
- تست بصری واقعی مرورگر انجام نشد.
