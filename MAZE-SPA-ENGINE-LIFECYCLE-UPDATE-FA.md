# گزارش پیاده‌سازی معماری یکپارچه SPA و چرخه عمر Maze

## نتیجه معماری

- مسیرهای `/maze.html` و `/play` در `shared/site-routes.json` به‌عنوان Routeهای `soft: true` و `server: "spa"` ثبت شده‌اند.
- مسیرهای مستقیم و Refresh در سرورِ دارای Build، همان `dist/site/index.html` را دریافت می‌کنند. سند قدیمی Maze فقط از مسیر صریح `/maze-legacy.html` برای Rollback در دسترس است.
- برنامه فقط یک React root دارد. `MazeFrame` به‌صورت پایدار در همان درخت React و از طریق Portal نمایش داده می‌شود؛ Routeهای دیگر فقط آن را پنهان می‌کنند.
- رابط سنگین Maze برای مهمان بارگیری نمی‌شود. پس از نخستین فعال‌سازی احرازشده، مارکاپ اصلی بازی برای عمر React root حفظ می‌شود؛ این تصمیم به‌خاطر Cache شدن DOM nodeها در `engine/dom.ts` ضروری است.

## چرخه عمر Engine

- Import کردن `engine-entry.ts` دیگر بازی را اجرا نمی‌کند. `mountMazeEngine()` شروع Runtime را به‌صورت صریح و idempotent انجام می‌دهد و تابع بازگشتی، `dispose` است.
- Listenerهای ورودی و Window با `AbortController` متعلق به همان Mount ثبت می‌شوند.
- حلقه‌ی Simulation فقط یک RAF فعال دارد و هنگام Dispose لغو می‌شود؛ در حالت مخفی‌شدن سند نیز متوقف و هنگام بازگشت دوباره زمان‌بندی می‌شود.
- اتصال WebSocket، Listenerهای همان Socket، Timer تلاش مجدد و Pending Action هنگام خروج پاک می‌شوند.
- Timerهای کوتاه افکت‌های Engine در `runtime-timers.ts` ثبت و هنگام Dispose لغو می‌شوند.
- Subscription و Actionهای Lobby هنگام Dispose آزاد می‌شوند؛ وضعیت و Cache اصلی `LobbyStore` حفظ می‌شوند. وضعیت‌های موقتی Join/Waiting، Spectate، Busy و Copy نیز به‌درستی جمع می‌شوند تا در ورود بعدی باقی‌مانده‌ی کهنه ایجاد نکنند.
- بازی Solo قبل از خروج ذخیره می‌شود تا با ورود مجدد قابل بازیابی باشد. خروج از مسابقه آنلاین/تماشا، پیام Leave را در زمان فعال‌بودن اتصال می‌فرستد و سپس Socket را می‌بندد.

## انتقال صفحه و هویت

- یک `transition-coordinator` مالک تمام View Transitionهای همان سند است. در مرورگرهای پشتیبان از View Transition API بومی و در حالت جایگزین از WAAPI موجود استفاده می‌شود.
- محتوای فعال صفحه متحرک می‌شود و Header، Dock و Frame پایدار باقی می‌مانند. سطح مخفی Maze به‌اشتباه به‌عنوان محتوای فعال انتخاب نمی‌شود.
- Login، Logout و تعویض Routeها از همان هماهنگ‌کننده انتقال استفاده می‌کنند. Logout در Maze باعث Reload سند نمی‌شود و Cleanup مربوط به Engine را از مسیر چرخه عمر React اجرا می‌کند.
- کتابخانه‌ی انیمیشن جدید یا TanStack Query اضافه نشده است؛ APIها، پروتکل WebSocket، الگوریتم‌های Maze و فرمت Save تغییر طراحی نداده‌اند.

## اعتبارسنجی اجراشده

موارد موفق:

- `node --check server.js`
- `node --check scripts/check-layout.mjs`
- `node scripts/check-layout.mjs`
- `node --test tests/identity/identity-bootstrap.test.cjs` — هر ۳ تست موفق
- Parse نحوی ۲۹ فایل تغییرکرده TypeScript/TSX — بدون خطای نحوی
- اعتبارسنجی JSON برای `shared/site-routes.json`

مواردی که در این محیط قابل تأیید نبودند:

- Typecheck کامل اجرا نشد؛ نصب وابستگی‌ها کامل نشد و `@types/node` و `vite/client` در دسترس نبودند.
- Vite Build و تست‌های Vitest/مرورگر اجرا نشدند؛ `node_modules` موجود نبود و `npm ci` در زمان دریافت بسته‌ها متوقف شد. محیط نیز Node `22.16.0` دارد، درحالی‌که پروژه `22.23.4` را در `engines` مشخص کرده است.
- `tests/identity/identity-routes.test.cjs` به‌علت نبود `better-sqlite3` اجرا نشد.

بنابراین نتیجه‌ی بررسی معماری و Syntax موفق است، اما این گزارش ادعای Build، Typecheck کامل یا تست بصری مرورگر ندارد. پس از نصب موفق وابستگی‌ها روی نسخه Node تعریف‌شده، اجرای `npm run check` و تست E2E مرورگر مرحله‌ی تأیید نهایی باقی می‌ماند.
