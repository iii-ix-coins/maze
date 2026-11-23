# گزارش تغییرات — پاک‌سازی Holders و More، افزودن Notifications و انتقال Theme به Dock

## تغییرات رابط کاربری

- گزینه‌های `Holders` و `More` از ناوبری پایین حذف شدند.
- دکمهٔ `Notifications` به ناوبری اضافه شد. پنل آن باز و بسته می‌شود، با کلیک بیرون یا کلید Escape بسته می‌شود و در وضعیت فعلی پیام خالی‌بودن اعلان‌ها را نمایش می‌دهد.
- انتخاب‌گر سه‌حالتهٔ Theme از محل قبلی به شکل عمودی، میان Notifications و Create منتقل شد.
- ترتیب جدید ناوبری: `Home → Explore → Notifications → Theme → Create → Profile`.
- مقصد و عملکرد دکمهٔ `Create` تغییر نکرده است.

## پاک‌سازی Holders

- Route و aliasهای صفحهٔ Holders حذف شدند.
- فایل HTML و API config اختصاصی Holders حذف شدند.
- صفحه، کامپوننت‌ها و hook اختصاصی Holders حذف شدند.
- endpointهای اختصاصی Holders از سرور حذف شدند.
- سرویس snapshot، state اختصاصی و Holder Engine از چرخهٔ اجرا حذف شدند.
- پیش‌نمایش Holders از Home و CSS اختصاصی آن حذف شد.
- گزینه‌ها و استایل‌های اختصاصی More نیز از ناوبری حذف شدند.

## مواردی که عمداً حفظ شده‌اند

- دادهٔ خام `holderCount` که از payload ارائه‌دهندهٔ عمومی بازار می‌آید، در payload خام و state بازار دست‌نخورده مانده است؛ این فیلد دیگر توسط صفحه یا قابلیت Holders مصرف یا نمایش داده نمی‌شود.
- خلاصهٔ مستقل بازار در Home و API/Engine مشترک Market حفظ شده‌اند.
- Wallet، احراز هویت، Profile، Create، Explore، Live/Rooms، Game State، WebSocket و موتور بازی بازنویسی نشده‌اند.

## وضعیت Notifications

در نسخهٔ مبنا سرویس یا API اعلان وجود نداشت. بنابراین این تغییر یک کنترل واقعی باز/بسته‌شونده با حالت خالی فراهم می‌کند، اما ادعا نمی‌کند اعلان واقعی یا شمارنده‌ای از Backend دریافت می‌شود. اتصال feed اعلان نیازمند تعریف منبع داده و API مستقل است.

## اعتبارسنجی

- `scripts/check-layout.mjs`: موفق.
- `scripts/check-css-duplicates.mjs`: موفق؛ ۱۸ فایل CSS فعال بررسی شدند.
- TypeScript/TSX syntax transpile: شش فایل مرتبط بدون خطای نحوی.
- `node --check server.js`, `node --check start.js` و `node --check scripts/check-layout.mjs`: موفق.
- Typecheck کامل اجرا نشد؛ type definitionهای `node` و `vite/client` در محیط ZIP نصب نبودند.
- Production Build و تست مرورگر اجرا نشدند؛ `node_modules` در ZIP وجود ندارد.


## اصلاح تکمیلی Dock

- جای Create و Notifications جابه‌جا شد؛ Create اکنون در مرکز ردیف اصلی دکمه‌ها قرار دارد.
- انتخاب‌گر عمودی تم به انتهای سمت راست Dock منتقل شد و فقط عرض ذاتی خود را اشغال می‌کند.
- قاب بیرونی انتخاب‌گر تم (border/background frame) حذف شد؛ سه گزینه و عملکرد تغییر تم حفظ شده‌اند.
- آزمون Layout برای ترتیب جدید Create، Notifications و Theme به‌روزرسانی شد.
