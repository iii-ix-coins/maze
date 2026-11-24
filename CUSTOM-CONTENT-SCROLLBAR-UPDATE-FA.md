# گزارش تغییرات اسکرول قاب محتوا

## هدف

اسکرول عمودی صفحات عادی سایت همچنان فقط داخل `.feature-page-shell` انجام می‌شود؛ اما Scrollbar بومی مرورگر با یک کنترل سفارشی و یکسان جایگزین شده است.

## تغییرات هندسه

- فاصله افقی بیرون قاب‌های سه‌گانه اکنون با `--site-frame-side-gutter: clamp(8px, 1.8vw, 16px)` کنترل می‌شود؛ بنابراین از `--gutter` عمومی سایر کامپوننت‌ها مستقل است.
- عرض دیداری ریل Scrollbar با `--site-scrollbar-track-width: 8px` تنظیم می‌شود.
- ناحیه تعامل/کلیک آن `--site-scrollbar-hit-width: 12px` است.
- فاصله ریل از لبه راست قاب با `--site-scrollbar-inset: clamp(3px, 0.55vw, 6px)` تعیین می‌شود.
- ارتفاع ریل ۶۰٪ قاب محتواست و با `top: 50%` و `translateY(-50%)` در مرکز قرار می‌گیرد.
- فضای بین محتوا و ریل با `--site-scrollbar-content-gap: 5px` تعیین می‌شود.
- `--site-frame-content-inline-padding` برای هر دو سمت چپ و راست یک مقدار مشترک می‌سازد تا محتوا با ریل تداخل نداشته باشد.
- Track و Thumb هر دو از Polygon هم‌جهت با قاب محتوا استفاده می‌کنند: برش بالا-راست و پایین-چپ.

## رفتار Scrollbar

کامپوننت جدید: `src/components/layout/RouteScrollbar.tsx`

- Scrollbar بومی قاب محتوا در Firefox با `scrollbar-width: none`، در Chromium/WebKit با `::-webkit-scrollbar { display: none; }` و در مرورگرهای قدیمی Edge/IE با `-ms-overflow-style: none` پنهان می‌شود.
- کامپوننت فقط زمانی نمایش داده می‌شود که محتوای Route واقعاً قابل‌اسکرول باشد.
- اندازه Thumb متناسب با نسبت ارتفاع قابل‌مشاهده به ارتفاع کل محتوا محاسبه می‌شود؛ حداقل ارتفاع آن ۲۲ پیکسل است.
- حرکت Thumb با اسکرول محتوا، تغییر اندازه، تغییر محتوای DOM و بارگذاری تصویر هماهنگ می‌شود.
- Drag کردن Thumb، کلیک روی Track، چرخ ماوس و کلیدهای Arrow، Page Up/Down، Home و End پشتیبانی می‌شوند.
- دکمه‌های فلش ابتدا/انتها وجود ندارند؛ کنترل سفارشی فقط Track و Thumb دارد.
- اسکرول افقی کنترل‌های داخلی مانند فیلترهای Feed و اسکرول‌های اختصاصی Maze تغییر نکرده‌اند.

## فایل‌های تغییرکرده

- `src/styles/site.css`
- `src/app/router.tsx`
- `src/components/layout/RouteScrollbar.tsx` (جدید)
- `scripts/check-layout.mjs`

## اعتبارسنجی

- Layout validation: موفق
- CSS duplicate check: موفق؛ ۱۹ فایل فعال
- SVG Theme contract: موفق؛ سه هشدار قدیمی درباره فایل‌های پس‌زمینه Maze که در ZIP ورودی هم موجود نبودند
- TypeScript/TSX syntax transpile: موفق برای `RouteScrollbar.tsx` و `router.tsx`
- Typecheck کامل: اجرا نشد؛ `@types/node` و `vite/client` در محیط نصب‌شده موجود نیستند
- اسکریپت PostCSS compatibility: اجرا نشد؛ بسته `postcss` در محیط نصب‌شده موجود نیست
- Production Build و تست بصری مرورگر: اجرا نشدند
