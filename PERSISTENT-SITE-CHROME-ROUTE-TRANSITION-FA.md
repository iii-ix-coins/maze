# تثبیت سه قاب هنگام جابه‌جایی Route

## هدف

Header، Navigation و قاب بیرونی Content باید در تمام جابه‌جایی‌های Route ثابت بمانند. فقط محتوای داخل قاب مرکزی جایگزین و در صورت نیاز انیمیت شود.

## تغییرات

- انتقال `SiteChromeHosts` از `AppRouter` به سطح اصلی `App` و قرار دادن آن پیش از Router.
- Memoize کردن `SiteChromeHosts`؛ Hookهای داخلی Navigation، Theme و Balance همچنان مستقل به‌روزرسانی می‌شوند.
- حذف منطق `animationend` و کلاس‌های موقت ورود Header و Dock.
- حذف انیمیشن ورود از `#site-header` و `#site-topbar`.
- حذف `key={pathname}` از قاب بیرونی `.route-page`؛ Border و هندسهٔ قاب در تمام Routeها ثابت می‌مانند.
- انتقال `key={pathname}` به کامپوننت داخلی `<Page />`؛ فقط محتوای Route تعویض می‌شود.
- انتقال انیمیشن ورود از `.route-page` به `.route-page > .feature-page-shell`.
- باقی‌ماندن `RouteScrollbar` در قاب بیرونی؛ با MutationObserver به اسکرولر محتوای جدید متصل می‌شود.
- افزودن Regression checks برای محل Mount پوسته، حذف انیمیشن قاب‌ها و ثابت ماندن قاب محتوا.

## بخش‌های محافظت‌شده

Theme Switcher، Header Coin Balance، Identity/Wallet، Route mapping، RouteScrollbar، Maze Game Loop، Simulation، Room Store و WebSocket protocol بازنویسی نشده‌اند. وضعیت Active دکمه‌های Navigation همچنان با Hook داخلی مسیر به‌روزرسانی می‌شود.

## اعتبارسنجی

- Layout validation: موفق
- CSS duplicate check: موفق
- SVG theme contract: موفق؛ سه هشدار دارایی پس‌زمینهٔ قدیمی از نسخهٔ ورودی باقی است.
- TypeScript/TSX syntax transpilation: موفق برای فایل‌های تغییرکرده.
- PostCSS parse: موفق برای ۱۹ فایل CSS.
- Typecheck کامل و Production Build: در محیط فعلی اجرا نشدند؛ `@types/node`، `vite/client` و Vite در نصب موجود نیستند.
- تست بصری مرورگر: اجرا نشده است.
