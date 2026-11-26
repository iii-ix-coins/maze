# یکپارچه‌سازی کامل Create، Rooms، Live و Waiting Room با Site Content Frame

## نتیجهٔ معماری

تمام Viewهای پیش از شروع مسابقه از یک قاب مرکزی سایت استفاده می‌کنند. دیگر برای Create، Rooms، Live یا Waiting Room قاب صفحه‌ای، عرض مستقل یا اسکرول عمودی جداگانه تعریف نشده است.

## مالکیت لایه‌ها

### ۱. قاب بیرونی سایت

**مالک:** `src/styles/site.css`

این فایل تنها مالک هندسهٔ قاب بیرونی است:
- موقعیت ثابت قاب بین Header و Dock؛
- عرض مشترک و حاشیه‌های واکنش‌گرا؛
- Border و برش گوشه‌ها؛
- فاصله‌های بالا و پایین؛
- قفل اسکرول سند و بدنه.

در حالت منوی Maze، `#mazeApp.maze-app.in-menu` دقیقاً همین قاب را اشغال می‌کند.

### ۲. سطح محتوای منوی Maze و اسکرول آن

**مالک:** `src/features/maze/styles/maze-unify.css`

- `#mazeApp.maze-app.in-menu` قاب بیرونی Site را مصرف می‌کند و هندسهٔ جداگانه‌ای برای عرض/ارتفاع صفحه تعریف نمی‌کند.
- `#createGame.cg` به‌صورت یک سطح داخلی absolute با `inset: 0` قاب را پر می‌کند.
- همین `#createGame.cg` تنها اسکرول عمودی منوی Maze است (`overflow-y: auto`).
- `RouteScrollbar` در `MazePage.tsx` دقیقاً همین عنصر را با Selector `:scope > #createGame.cg` کنترل می‌کند.
- Create، Rooms، Live و Waiting Room همگی فرزند همین سطح هستند.

Padding و عرض Create از توکن‌های مشترک Site می‌آیند:
- `--site-frame-content-padding-start`
- `--site-frame-content-padding-end`
- `--site-frame-content-padding`

Rooms، Live و Waiting Room نیز از همان عرض و Padding مشترک استفاده می‌کنند.

### ۳. Create Game

**مالک چیدمان داخلی:** `src/features/maze/styles/create-game.css`

این فایل فقط Grid و اجزای داخلی Wizard را کنترل می‌کند:
- عنوان و توضیح؛
- پیش‌نمایش Canvas؛
- نوار مراحل؛
- Stepها و تنظیمات؛
- Back و Continue؛
- Dial، Ruler و کنترل‌های ساخت.

`cg-layout` دیگر ارتفاع Viewport، قاب صفحه یا Scroll Container مستقل ندارد. ارتفاع آن بر اساس محتوا رشد می‌کند و اسکرول به `#createGame.cg` واگذار شده است. Padding قدیمی قاب از Breakpointهای Create حذف شده است.

### ۴. Rooms، Live و Waiting Room

**مالک چیدمان داخلی:** `src/features/maze/styles/lobby.css`

- `#lbRooms` و `#lbLive` هر دو از `.lb` و قاب مشترک استفاده می‌کنند.
- `#lbRoom` نیز از همان `.lb` استفاده می‌کند؛ Waiting Room قاب جداگانه ندارد.
- `.lb-room-screen` صرفاً Grid داخلی Stage و Panel است و عرض/Border/پس‌زمینهٔ قاب صفحه را تعریف نمی‌کند.
- Surface کارت‌های Room، پنل اطلاعات، فرم Join و کنترل‌های داخلی حفظ شده‌اند؛ این‌ها اجزای درونی‌اند و قاب صفحه محسوب نمی‌شوند.
- `.lb-members` دیگر ارتفاع محدود یا اسکرول مستقل ندارد و همراه Waiting Room در سطح اصلی حرکت می‌کند.

## یک اسکرول عمودی برای همهٔ منوها

مسیر اسکرول در منوی Maze:

`Site Content Frame` → `#mazeApp` → `#createGame.cg` → View فعال

- سند و `body` اسکرول نمی‌شوند.
- قاب بیرونی ثابت می‌ماند.
- Create، Rooms، Live و Waiting Room در یک جریان عمودی حرکت می‌کنند.
- `.cg-steps` و `.lb-members` اسکرول عمودی تو‌در‌تو ندارند.
- Scrollbar سفارشی `RouteScrollbar` مقدار `scrollTop` همین `#createGame.cg` را کنترل می‌کند.

## رفتارهای داخلی که حفظ شده‌اند

- `position: sticky` برای نوار Back/Continue و Stage اتاق، Scroll Container جدید ایجاد نمی‌کند و داخل اسکرول والد عمل می‌کند.
- `.race-board` در `maze-site.css` یک پنل رتبه‌بندی روی صفحهٔ مسابقهٔ در حال اجراست؛ اسکرول محدود آن برای مشاهدهٔ لیست بازیکنان HUD حفظ شده است. این پنل بخشی از منوی پیش از بازی نیست.
- کارت‌ها، Dialogها، ورودی‌ها، Dial، Ruler، Canvas و کنترل‌های داخلی ظاهر و رفتار مخصوص خود را حفظ می‌کنند.
- هنگام شروع مسابقه، کلاس `in-menu` برداشته می‌شود و `game-container` طبق معماری فعلی نمایش داده می‌شود؛ محیط واقعی اجرای بازی عمداً از قاب منوی پیش از بازی جدا می‌ماند.

## پاک‌سازی Legacy

- Grid قدیمی `.maze-app .cg-layout` از لایهٔ Legacy در `maze-site.css` حذف شد؛ `create-game.css` مالک Grid داخلی است.
- تعریف قدیمی `--cg-max: 1180px` و متغیرهای قدیمی Padding/Tab قاب از لایهٔ Legacy حذف شدند.
- Paddingهای مستقل و تکراری Create در Breakpoint کوتاه‌صفحه حذف شدند تا Site Frame تنها مالک فاصلهٔ قاب باشد.
- تعریف تکراری Grid/اسکرول برای `.cg-steps` حذف شد.
- `check-layout.mjs` اکنون وجود یک اسکرول منوی Maze، جایگاه absolute سطح مشترک، استفاده از توکن‌های Site و نبود اسکرول عمودی تو‌در‌تو را کنترل می‌کند.

## فایل‌های اصلاح‌شده

- `src/features/maze/styles/maze-unify.css`
- `src/features/maze/styles/create-game.css`
- `src/features/maze/styles/lobby.css`
- `src/features/maze/styles/maze-site.css`
- `scripts/check-layout.mjs`

## اعتبارسنجی

موفق:
- `node scripts/check-layout.mjs`
- `node scripts/check-css-duplicates.mjs` — ۱۹ فایل CSS فعال، بدون تکرار selector/property، keyframe یا font-face
- `node scripts/check-svg-theme.mjs`
- Parse تمام ۱۹ فایل CSS زیر `src` با PostCSS

محدودیت‌ها:
- Typecheck و Vite Build در این محیط اجرا نشدند؛ ZIP فاقد `node_modules` است و Vite و Type Definitions در دسترس نیستند.
- تست بصری واقعی مرورگر انجام نشده است.
- سه Asset پس‌زمینهٔ قدیمی که در ورودی نیز وجود نداشتند، همچنان هشدار می‌دهند: `3D-bg-grass.svg`، `3D-bg-dark.svg` و `3D-bg-light.svg`.
