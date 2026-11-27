# سیستم Motion یکپارچهٔ پلتفرم

## هدف

تمام جابه‌جایی‌های محتوایی Social و Game باید از یک قرارداد زمان‌بندی و یک هماهنگ‌کننده عبور کنند. Header، Dock، قاب اصلی و Scrollbar خارج از محدودهٔ انیمیشن محتوای Route باقی می‌مانند.

## قرارداد مرکزی زمان و حرکت

توکن‌های مرجع در `src/styles/style.css` تعریف شده‌اند:

```css
:root {
    --motion-route-duration: 220ms;
    --motion-route-easing: cubic-bezier(.22, 1, .36, 1);
    --motion-route-distance: 7px;
    --motion-route-exit-distance: 5px;
    --motion-theme-duration: 160ms;
}
```

`--motion-route-duration` مدت کل یک جابه‌جایی Route است، نه مدت جداگانهٔ هر نیمه:

- Native View Transition، Snapshot قدیمی و جدید را هم‌زمان در ۲۲۰ms اجرا می‌کند.
- WAAPI به‌دلیل اجرای ترتیبی خروج، Commit و ورود، بودجهٔ ۲۲۰ms را به دو فاز ۱۱۰ms تقسیم می‌کند؛ تنها یک فریم برای اعمال DOM بین دو فاز در نظر گرفته می‌شود.
- هر دو مسیر مقدار Duration و Easing را از همان توکن‌های CSS می‌خوانند. اعداد TypeScript صرفاً fallback دفاعی برای محیط فاقد CSS/DOM هستند.
- تغییر Theme توکن مستقل `--motion-theme-duration` دارد، اما قفل و صف اجرای آن با Transition محتوایی مشترک است.

## مالکیت اجرا

`src/platform/transition-coordinator.ts` تنها مالک Transitionهای محتوایی و Theme است:

- درخواست‌ها سریالی اجرا می‌شوند؛ درخواست جدید هنگام فعال‌بودن Transition قبلی رد یا بی‌انیمیشن Commit نمی‌شود.
- درخواست‌های منتظر با کلید یکسان و قابل جایگزینی (مانند مقصدهای Navigation یا Theme) به آخرین مقصد ادغام می‌شوند.
- درخواست هویت با اولویت `urgent` قبل از درخواست‌های نمایشی منتظر اجرا می‌شود. در صورت امکان، فاز بصری عملیات عادی فعال کوتاه/لغو می‌شود، اما Update فعال گم نمی‌شود.
- Callback درخواست فعال حداکثر و عملاً دقیقاً یک‌بار اعمال می‌شود؛ خطا یا لغو Animation نباید صف را قفل کند.
- `waitForTransitionQueueIdle()` پایان همهٔ کارهای پذیرفته‌شدهٔ درون‌سندی را اعلام می‌کند؛ ناوبری سندی قبل از شروع انیمیشن خروج منتظر این نقطه می‌ماند.
- `prefers-reduced-motion` محترم است؛ در این حالت تغییر وضعیت بدون حرکت انجام می‌شود.

## مسیریابی

- Routeهای Home، Explore، Profile، Maze Hub، Create، Rooms، Live و Gameplay در یک SPA و یک React root قرار دارند.
- پیش از Transition، Lazy Chunk مقصد با `preloadSiteRoutePage()` آماده می‌شود؛ سپس Commit Route از همان Coordinator عبور می‌کند.
- مسیر موازی CSS/Timer برای Lazy Route وجود ندارد. Navigationهای سریع با نسخهٔ intent محافظت می‌شوند تا مقصد قدیمی پس از مقصد جدید اعمال نشود.
- `route-view` سطح محتوایی متحرک است. Header، Dock، قاب‌ها و Scrollbar ثابت می‌مانند.
- مسیرهای واقعاً خارج از SPA تنها پس از خالی‌شدن صف محتوایی از سند خارج می‌شوند و برای WAAPI سندی نیز توکن‌های مرکزی را مصرف می‌کنند.

## هویت و بازی

- Login و Logout در همان سند و از همان Coordinator عبور می‌کنند.
- Logout، Session نامعتبر و پاسخ 401 اولویت فوری دارند.
- `MazeMenu` و آماده‌شدن محتوای Engine برای Transition محتوایی از همان API استفاده می‌کنند؛ منطق Engine و انیمیشن‌های ذاتی Simulation بخشی از سیستم Motion صفحات نیستند.
- ریزتعامل‌های محلی مانند فشردن دکمه، Glider یا تغییر رنگ کنترل‌ها می‌توانند مدت کوتاه مختص خود را داشته باشند؛ اما نباید Route Surface، Theme یا زمان‌بندی Logout را مالک شوند.
- Game Loop، Simulation، الگوریتم‌ها، Canvas، WebSocket، Room Store و Backend در این اصلاح تغییر نکرده‌اند.

## دسترس‌پذیری

`prefers-reduced-motion: reduce` مسیرهای متحرک را غیرفعال می‌کند، ولی Update و ناوبری را حفظ می‌کند. هیچ کاربر دارای این تنظیمی برای دیدن انیمیشن مجبور نمی‌شود.

## اعتبارسنجی

تست‌های Coordinator در `src/platform/transition-coordinator.test.ts` رفتار صف، coalescing، اولویت Logout، اشتراک قفل Theme/Content، WAAPI و Reduced Motion را پوشش می‌دهند. اجرای کامل Vitest، Build و Browser E2E باید در CI با Node تعریف‌شده در `.nvmrc` انجام شود؛ Parse نحوی یا تست دستی جایگزین آن‌ها نیست.
