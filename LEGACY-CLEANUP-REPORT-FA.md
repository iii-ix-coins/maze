# گزارش پاک‌سازی کنترلرها و Bootstrapهای Legacy

## جمع‌بندی

کنترلرهای مستقل DOM و Bootstrapهای قدیمی از مسیر فعال رابط حذف شدند. رابط‌های سایت و پس‌زمینهٔ Maze اکنون توسط React مدیریت می‌شوند. قراردادهای Backend، API، Simulation، Renderer، Input و WebSocket بدون تغییر باقی مانده‌اند.

## حذف‌ها و جایگزینی‌ها

- ۳۷ فایل از `public/js/` و ۳۷ نسخهٔ تکراری از `src/features/home/legacy-scripts/` حذف شدند.
- `src/features/theme/maze-background.js` و تابع imperative `initMazeBackground()` حذف شدند. SVG پس‌زمینه اکنون در `src/features/theme/MazeBackground.tsx` توسط JSX ساخته می‌شود؛ camera transform همچنان در همان RAF مستقل به‌روزرسانی می‌شود و هیچ React render در هر فریم انجام نمی‌شود.
- فایل‌های خروجی قدیمی Maze شامل `app.js`، `app.js.map`، `app.css`، `app.css.map` و شش فونت hashed مخصوص همان bundle حذف شدند. پنج SVG که Wizard فعلی استفاده می‌کند حفظ شده‌اند.
- فایل خارجی `theme-init.js` حذف شد. منطق حداقلی خواندن `hollld-theme` با همان مقادیر مجاز پیش از CSS در چهار HTML ورودی قرار گرفت تا جلوگیری از FOUC و رفتار ذخیره‌شده حفظ شود.
- دو صفحهٔ `legacy/home.html` و `legacy/maze.html` به fallbackهای ثابت و فاقد JavaScript تبدیل شدند؛ این فایل‌ها باقی ماندند چون Express بدون تغییر در نبود Build تولیدی به آن‌ها ارجاع می‌دهد.
- README، سند مهاجرت و `scripts/check-layout.mjs` به‌روزرسانی شدند.

## Bootstrapهای کوچک باقی‌مانده و دلیل نگهداری

تنها کدهای inline پیش از Paint باقی‌مانده‌اند و هیچ‌کدام UI تولید نمی‌کنند:

1. اسکریپت theme در چهار صفحه، مقدار ذخیره‌شدهٔ `hollld-theme` را پیش از بارگذاری CSS روی `html[data-theme]` اعمال می‌کند تا تم پیش‌فرض لحظه‌ای نمایش داده نشود.
2. یک اسکریپت در `index.html` فقط هنگام مسیر `/maze.html` کلاس موجود `body.in-menu` و عنوان صفحه را پیش از mount شدن React تنظیم می‌کند تا همان selectorهای CSS بدون پرش حفظ شوند.

این دو قطعه، منطق UI یا کنترلر Legacy نیستند و حذفشان رفتار اولیهٔ بصری را تغییر می‌دهد.

## محدوده‌های عمداً دست‌نخورده

- `server.js` و `start.js`
- `engines/` و `shared/`
- `src/services/api/contracts.ts`
- فایل‌های Game Loop، Simulation، Canvas Renderer، Maze generator، Input و Multiplayer/WebSocket
- `package.json` و نسخه‌های وابستگی
- API endpointها، HTTP methodها، payloadها و response shapeها

۱۴۸ فایل محافظت‌شده با SHA-256 نسبت به نسخهٔ پیش از پاک‌سازی مقایسه شدند؛ هر ۱۴۸ مورد بدون تغییر هستند.

## اعتبارسنجی اجراشده

| بررسی | نتیجه |
|---|---:|
| `node scripts/check-layout.mjs` | موفق |
| Syntax transpile تعداد ۸۱ فایل TypeScript/TSX | بدون Diagnostic |
| `node --check` تعداد ۱۰۴ فایل JS/ESM/CJS | موفق |
| Syntax پنج اسکریپت inline صفحات HTML | موفق |
| فایل مستقل JS در `src/` و `public/` | صفر |
| تطبیق SHA-256 فایل‌های محافظت‌شده | ۱۴۸ از ۱۴۸ بدون تغییر |

`check-layout` اکنون نبود مسیرهای Legacy شناخته‌شده و نبود هر فایل مستقل `.js`، `.mjs` یا `.cjs` در `src/` و `public/` را کنترل می‌کند.

## مواردی که هنوز تأیید نشده‌اند

Typecheck کامل، Vite Production Build و تست بصری مرورگر در این مرحله اجرا نشده‌اند. این محیط وابستگی‌های محلی نصب‌شده ندارد و دسترسی قبلی به npm registry نیز با خطای DNS/شبکه متوقف شده بود. بررسی Syntax و ساختار، جایگزین این آزمون‌ها نیست.

همچنین تا زمانی که Build تولیدی وجود نداشته باشد، مسیرهای fallback ثابت Express پیام نیاز به Build را نمایش می‌دهند؛ پس از Build، مسیرهای اصلی React همان مسیرهای فعال پروژه هستند.
