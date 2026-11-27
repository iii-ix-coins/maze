# معماری یکپارچهٔ ریشه و سطح Route — ۲۷ نوامبر ۲۰۲۶

## تصمیم معماری

هدف این بازطراحی «شبیه‌سازی ظاهر دو پوسته» نیست؛ تمام صفحات باید واقعاً از یک قرارداد DOM، یک مسیر Layout و یک مالک اسکرول استفاده کنند. در معماری جاری هیچ Route مستقلی برای بازی، Portal موازی، document root دوم یا scrollbar دوم وجود ندارد.

## درخت نهایی

```text
body
└── #root                         تنها React mount
    ├── AppProviders
    ├── SiteChromeHosts           Header / Theme / Dock پایدار
    └── AppRouter
        └── .route-page           قاب بیرونی واحد و persistent
            ├── main.feature-page-shell   تنها viewport و scroll owner
            │   ├── section.route-view   Home / Explore / Profile / Maze Hub
            │   └── section#mazeApp.route-view   Maze، پس از اولین mount پایدار
            │       ├── Create / Rooms / Waiting / Live UI
            │       └── Gameplay DOM / Canvas / HUD / Race Board
            └── RouteScrollbar      اندازه‌گیری همان feature-page-shell
```

در هر لحظه فقط Route فعال قابل مشاهده است؛ `#mazeApp` در زمان حضور در Route دیگر با `hidden` پارک می‌شود تا DOM nodeهایی که Engine در `engine/dom.ts` cache کرده، عوض نشوند. کارت‌های داخل `PageAccessGate` در تصویر ارسالی پیش‌نمایش‌های Read-only هستند، نه Route یا React root مستقل؛ پس از احراز هویت، صفحهٔ واقعی در همین `route-view` مشترک نمایش داده می‌شود. پارک‌شدن DOM به معنی فعال‌ماندن Engine نیست: `MazePage` در تغییر Route قرارداد `mountMazeEngine()/dispose()` را اجرا می‌کند.

## قراردادهای غیرقابل مذاکره

- `#root` تنها mount برنامه است.
- `.route-page` تنها قاب بیرونی است و با تغییر Route تعویض نمی‌شود.
- `main.feature-page-shell` تنها سطح محتوایی، مالک گاترها، padding قاب، اسکرول عمودی و overscroll است؛ هیچ Route یا زیرصفحه‌ای مجاز نیست گاتر افقی/عمودی قاب را دوباره اضافه کند.
- هر صفحه دقیقاً یک `.route-view` مستقیم داخل سطح مشترک دارد. `#mazeApp` خودش همان Route View است و نباید داخل یک frame یا scroller موازی قرار بگیرد.
- `RouteScrollbar` فقط `:scope > .feature-page-shell` را اندازه می‌گیرد.
- `transition-coordinator` سطح فعال `.route-view` را انتخاب می‌کند؛ header، dock و قاب بیرونی بین Transitionها ثابت می‌مانند.
- کلاس‌های `in-menu`، `wide` و `spectating` فقط روی `#mazeApp` هستند. هیچ وضعیت Layout مختص بازی نباید روی `body` قرار گیرد. متغیر اندازهٔ بورد `--v` نیز فقط روی `#mazeApp` تنظیم و هنگام Dispose حذف می‌شود.
- `fitLayout()` ابعاد بازی را از `#mazeApp.getBoundingClientRect()` می‌گیرد، نه از `window.innerWidth/innerHeight` به‌عنوان منبع اصلی.
- Gameplay می‌تواند اسکرول همان `feature-page-shell` را موقتاً قفل کند، اما مجاز به ایجاد scrollbar، viewport یا قاب دوم نیست.

## مسئولیت لایه‌ها

| لایه | مالکیت |
|---|---|
| `App` / `AppProviders` | هویت، Providerها، Error Boundary و یک چرخهٔ برنامه |
| `SiteChromeHosts` | هدر، تم و Navigation پایدار |
| `AppRouter` | انتخاب Route و نگه‌داشتن قاب و سطح محتوای مشترک |
| `.feature-page-shell` | هندسهٔ محتوا، padding/gutter، scrolling و overscroll |
| `RouteScrollbar` | رندر/تعامل scrollbar مشترک بر اساس همان scroller |
| `MazeFrame` | Route View پایدار Maze، state تم محلی، حالت gameplay و Gate هویت |
| `MazePage` / `engine-entry` | mount/dispose موتور، listenerها، RAF، Timerها و WebSocket |
| Engine / Canvas / Simulation | الگوریتم‌ها، state بازی، Game Loop و پروتکل Multiplayer |

## چرخهٔ خروج و بازگشت

1. Route به Maze تغییر می‌کند؛ `#mazeApp` از حالت parked خارج می‌شود و همان Content Surface مشترک در دسترس قرار می‌گیرد.
2. پس از احراز هویت، markup بازی یک‌بار ساخته می‌شود و Engine پس از آماده‌بودن DOM mount می‌شود.
3. هنگام رفتن به Route دیگر، Engine وضعیت قابل‌بازیابی را ذخیره می‌کند، session آنلاین/در انتظار را طبق قرارداد می‌بندد، listenerها و RAF را abort می‌کند و WebSocket را می‌بندد.
4. `#mazeApp` در همان درخت React مخفی می‌شود؛ نه unmount کامل می‌شود و نه DOM cache آن جایگزین می‌گردد.
5. با بازگشت به Maze، همان nodeها باقی‌اند و Runtime تازه روی آن‌ها mount می‌شود. داده‌های پایدار Store و اطلاعات ذخیره‌شده طبق قرارداد قبلی نگه داشته می‌شوند.

## کنترل‌های معماری

`node scripts/check-layout.mjs` باید موارد زیر را enforce کند:

- نبود `#maze-root` و `createPortal` برای Maze؛
- تنها یک `main.feature-page-shell` در Router؛
- حضور مستقیم `MazeFrame` در همان سطح مشترک؛
- عدم وجود RouteScrollbar یا scroller عمودی مستقل در Maze؛
- نبود کلاس‌های `wide`، `spectating` و `in-menu` روی `document.body`؛
- نبود padding/gutter تکراری در ریشه‌های Create و Lobby؛
- محلی‌بودن متغیر `--v` در `#mazeApp` و حذف آن هنگام Dispose؛
- هدف مشترک برای View Transition و scrollbar؛
- حفظ قرارداد mount/dispose موتور.

## اعتبارسنجی این تغییر

- `node scripts/check-layout.mjs`: موفق.
- `node scripts/check-css-duplicates.mjs`: ۲۰ فایل CSS فعال بررسی شد؛ تکرار ناخواستهٔ selector/property، keyframes و font-face دیده نشد.
- `node scripts/check-svg-theme.mjs`: موفق؛ مسیر هر سه asset پس‌زمینهٔ Maze به فایل واقعی `wallet-bg-*.svg` اصلاح شد.
- تست `identity-bootstrap`: هر ۳ تست موفق.
- بررسی نحوی TypeScript: ۱۳۷ فایل TS-family بدون خطای Parse؛ ۱۳۴ فایل اجرایی بدون diagnostic در Transpile با TypeScript 5.8.3. این بررسی جایگزین Typecheck نیست.
- `node --check`: فایل‌های JavaScript/MJS/CJS پروژه بدون خطای نحوی.
- Typecheck کامل اجرا نشد: `@types/node` و `vite/client` نصب نیستند. Vite Build نیز اجرا نشد چون Vite محلی نصب نیست. پروژه Node `22.23.4` می‌خواهد؛ محیط بررسی Node `22.16.0` دارد.
- تست بصری واقعی مرورگر انجام نشده است؛ بنابراین رندر نهایی، تعامل در دسکتاپ/موبایل و سلامت Build هنوز باید در محیط وابستگی‌های کامل بررسی شوند.
