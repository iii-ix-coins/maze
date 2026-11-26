# رفع اسکرول‌بار دوم و تکمیل یکپارچگی قاب محتوای Maze

## مشاهده
در تصویر Create، دو ریل عمودی دیده می‌شد: ریل سفارشی داخل قاب مرکزی و یک ریل اضافه در لبهٔ راست پنجره.

## علت
`MazeFrame` در `App.tsx` از طریق Portal به `#maze-root` منتقل می‌شود و خودش `RouteScrollbar` مخصوص `#createGame.cg` را دارد. بااین‌حال `AppRouter` همچنان برای مسیر `maze` یک `.route-page` خالی می‌ساخت و داخل آن هم `RouteScrollbar` عمومی را رندر می‌کرد. چون این قاب برای مسیر Maze اسکرولر مستقیمی نداشت، کامپوننت هدفی برای اتصال پیدا نمی‌کرد؛ اما CSS ریل را حتی در حالت `data-visible=false` پنهان نمی‌کرد. در نتیجه ریل بدون اسکرولر به شکل اسکرول دوم دیده می‌شد.

## اصلاحات
1. `src/app/router.tsx`: مسیر `maze` پیش از ساخت `.route-page`، زودهنگام `null` برمی‌گرداند. Maze فقط از قاب Portal خودش استفاده می‌کند و دیگر قاب خالی سایت یا RouteScrollbar دوم ساخته نمی‌شود.
2. `src/styles/site.css`: هر `.route-scrollbar[data-visible="false"]` با `visibility: hidden` و `pointer-events: none` پنهان می‌شود؛ این رفتار برای صفحات عادی نیز از ریل‌های بدون محتوای قابل اسکرول جلوگیری می‌کند.
3. `scripts/check-layout.mjs`: کنترل رگرسیون برای عدم ساخت `MazeRouteShell` و پنهان‌بودن ریل‌های بدون هدف اضافه شد.

## اسکرول نهایی
- Create / Rooms / Live / Waiting Room: فقط `#createGame.cg` اسکرول عمودی منو را مالک است و `MazeFrame` یک RouteScrollbar متصل به همین عنصر دارد.
- صفحات عادی سایت: `.feature-page-shell` اسکرولر هر صفحه است و قاب Route فقط یک RouteScrollbar دارد.
- `race-board` در HUD مسابقه، در صورت نیاز، اسکرول داخلی خودش را حفظ می‌کند؛ این پنل بخشی از منوی پیش از بازی نیست و تغییر داده نشده است.

## محدودهٔ محافظت‌شده
Game Loop، Simulation، Canvas، الگوریتم‌ها، WebSocket، Room Store، API و Backend تغییر نکرده‌اند.

## اعتبارسنجی
نتایج اجرای `check-layout` و `check-css-duplicates` در خروجی تحویل ثبت می‌شوند. Build، Typecheck و تست بصری مرورگر فقط در صورت وجود وابستگی‌ها و محیط مرورگر قابل تأیید هستند.
