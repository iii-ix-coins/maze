# گزارش نهایی یکپارچه‌سازی ریشه‌ای Social + Game

## هدف این فاز

ساخت یک معماری و یک سیستم طراحی در سطح پلتفرم برای تمام Routeها؛ بدون بازنویسی موتور بازی. در این مرحله Maze نباید سند، Frame، Scroll owner، Theme، Wallet CTA یا سیستم انیمیشن موازی داشته باشد. بازطراحی داخلی Gameplay و Engine می‌تواند در فاز جداگانه و روی همین قرارداد مشترک انجام شود.

## قرارداد نهایی معماری

```text
App / React root
└── AppRouter
    └── .route-page
        ├── main.feature-page-shell       ← تنها Content Surface و Scroll owner
        │   ├── .route-view               ← Home / Explore / Profile / Hub
        │   ├── .route-view.route-view--access
        │   │   └── PageAccessGate        ← Gate واحد برای تمام Routeهای مهمان
        │   └── #mazeApp.route-view       ← میزبان پایدار Maze پس از احراز هویت
        │       └── MazePage / Engine host
        └── RouteScrollbar                ← فقط متصل به feature-page-shell

Site Header / Navigation / Dock
└── خارج از محتوای Route و مشترک میان تمام صفحات
```

`#mazeApp` همچنان می‌تواند به‌عنوان میزبان پایدار DOM موتور باقی بماند، اما دیگر ریشه‌ی طراحی یا Layout نیست. قواعد عمومی `.route-view` عیناً روی آن اعمال می‌شوند.

## تغییرات اجراشده

### ۱. یک ریشه‌ی React و یک Content Surface

- Routeهای عادی و Maze در همان React root، همان Router، همان `.route-page` و همان `main.feature-page-shell` نمایش داده می‌شوند.
- `feature-page-shell` تنها مالک اسکرول عمودی، گاترهای افقی، padding قاب و Scrollbar سفارشی است.
- استثنای `route-page--maze-gameplay` حذف شد؛ وضعیت Gameplay دیگر Overflow یا Layout پوسته‌ی اصلی سایت را تغییر نمی‌دهد.
- overrideهای مخصوص ارتفاع، عرض، padding، background، isolation و overflow ریشه‌ی `#mazeApp` از CSSهای Site و Maze حذف شدند. میزبان بازی اکنون قرارداد عمومی `.route-view` را به ارث می‌برد.
- `MazeFrame` دیگر کلاس یا MutationObserver روی `.route-page` اعمال نمی‌کند.

### ۲. یک Access Gate و یک دکمه‌ی Wallet

- Gate مهمان برای Home، Explore، Profile، Maze Hub، Create، Rooms، Live و Waiting Room همگی در `AppRouter` ساخته می‌شود.
- Gate دیگر داخل `MazeFrame` رندر نمی‌شود؛ `MazeFrame` فقط میزبان محتوای احراز هویت‌شده‌ی بازی است.
- پیش‌نمایش‌های شبه‌صفحه‌ی جداگانه و هدرهای تکراری Rooms/Create/Profile حذف شده‌اند. تفاوت صفحات فقط با محتوای متنی زمینه‌ای مشخص می‌شود.
- دکمه‌ی Wallet از همان `WalletConnectButton` پلتفرم استفاده می‌کند. Variant معنایی `primary` ظاهر آن را با توکن‌های اصلی سایت مشخص می‌کند؛ منطق اتصال و احراز هویت تغییر نکرده است.
- قواعد قدیمی Maze برای Button و Heading دیگر روی تمام فرزندان میزبان اعمال نمی‌شوند و فقط به کنترل‌های واقعی `game-container` محدودند.
- قانون تم Grass برای Border کنترل‌ها نیز فقط روی کنترل‌های واقعی Game/Create/Lobby اثر می‌گذارد، نه روی دکمه‌ی Wallet مشترک.

### ۳. یک Theme source

- `html[data-theme]` تنها منبع Theme پلتفرم است.
- کپی Theme سند روی `#mazeApp` و listener جداگانه‌ی `site:themechange` حذف شده است.
- ریشه‌ی Maze دیگر رنگ، پس‌زمینه، Font، padding یا تنظیمات مستقل صفحه را تحمیل نمی‌کند.
- نگاشت متغیرهای داخلی Create/Lobby به توکن‌های تم سایت صرفاً Adapter محتوای Feature است، نه Theme مستقل برای Shell.

### ۴. یک سیستم انیمیشن و Transition

- تغییر Route و تغییر Tabهای Create/Rooms/Live از هماهنگ‌کننده‌ی مشترک `startContentViewTransition` استفاده می‌کنند.
- Transition نام‌گذاری‌شده و فلگ CSS مجزای Maze menu حذف شده‌اند.
- پاک‌سازی fallback فقط پس از پایان واقعی `site-route-content-enter` روی همان `.route-view` فعال انجام می‌شود؛ دیگر پایان انیمیشن با عنصر `main` اشتباه گرفته نمی‌شود.
- برای Native View Transition یک watchdog محدود وجود دارد تا انیمیشن لغوشده نتواند قفل Transitionهای بعدی را نگه دارد.
- انیمیشن‌های Header، Dock و قاب بیرونی در Transition محتوای Route دخالت داده نمی‌شوند.

### ۵. محدوده‌ی Engine

منطق شبیه‌سازی، الگوریتم‌ها، Canvas، Game Loop، WebSocket، Multiplayer و Room Store در این فاز بازنویسی نشده‌اند. تغییرات `MazeFrame` فقط به میزبانی Route، Gate، و حذف اثرگذاری وضعیت بازی بر پوسته‌ی Site مربوط‌اند. CSS داخلی محتوای Game باقی مانده، اما دیگر نمی‌تواند Shell، Scroll owner یا Theme پلتفرم را تعریف کند.

## تست‌ها و اعتبارسنجی

موارد زیر در این محیط اجرا و موفق شدند:

- `node scripts/check-layout.mjs` — قرارداد Root، Router، Access Gate، Wallet و Transition
- `node scripts/check-css-duplicates.mjs` — ۲۰ فایل CSS فعال، بدون تکرار ناخواسته‌ی selector/property/keyframes/font-face
- `node scripts/check-svg-theme.mjs` — قرارداد Theme و دارایی‌های SVG
- `node --test tests/identity/identity-bootstrap.test.cjs` — ۳ تست از ۳ تست موفق
- Parse نحوی TypeScript/TSX برای ۶ فایل تغییریافته — بدون خطای نحوی
- Parse با PostCSS برای ۷ فایل CSS تغییریافته — موفق
- مقایسه با سورس مرجع: ۱۵ فایل اضافه/اصلاح‌شده و هیچ فایل حذف‌شده‌ای نسبت به آن مقایسه

### محدودیت‌های تأییدنشده

- Typecheck کامل، Vite Build و تست بصری در مرورگر در این محیط تأیید نشده‌اند؛ وابستگی‌های محلی پروژه نصب نیستند.
- نسخه‌ی Node موجود `22.16.0` است، درحالی‌که `.nvmrc` پروژه `22.23.4` را تعیین کرده است.
- Parse نحوی جایگزین Typecheck نیست و تست‌های ایستا جایگزین تست واقعی Light/Dark/Grass، Login/Logout و رفت‌وبرگشت Route در مرورگر نیستند.

## گام اعتبارسنجی بعدی

در محیط توسعه با Node `22.23.4` وابستگی‌ها نصب شوند؛ سپس `npm run check` اجرا و سناریوهای زیر به‌صورت بصری بررسی شوند: ورود مهمان از `/maze.html?view=create` و `/maze.html?view=rooms`، اتصال Wallet، ورود/خروج، رفت‌وبرگشت از Create به Home و Explore و بازگشت به Create، و بررسی Transition در مرورگرهای پشتیبان و فاقد View Transition API.
