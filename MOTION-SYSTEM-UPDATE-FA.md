# پیاده‌سازی Motion System برای MAZE

## هدف

افزودن حرکت‌های ظریف به داک ناوبری، تغییر صفحات عادی و تب‌های Create / Rooms / Live، بدون متحرک‌کردن Header، داک، قاب ثابت محتوا یا قاب اصلی بازی.

## تغییرات

### داک ناوبری

- وضعیت Active با یک نشانگر باریک زیر آیکون مشخص می‌شود.
- آیکون فعال فقط ۱٫۰۳۵ برابر بزرگ‌تر نمایش داده می‌شود.
- هنگام فشردن کنترل، آیکون تا ۰٫۹۴ برابر کوچک می‌شود.
- رنگ، شفافیت، نشانگر و مقیاس با زمان حدود ۱۸۰ms تغییر می‌کنند.
- ابعاد خانه‌های داک، Grid و جایگاه خود داک تغییر نمی‌کنند؛ Transform کلی دکمه در حالت فشردن خنثی شده و فقط آیکون بازخورد می‌دهد.

### صفحات عادی

- فقط `.feature-page-shell` نام View Transition اختصاصی `site-route-content` می‌گیرد.
- خروج محتوا حدود ۱۳۰ms و ورود آن حدود ۲۲۰ms با جابه‌جایی عمودی ۵ تا ۷ پیکسل است.
- در مرورگرهای فاقد View Transition API، خروج CSS پیش از تغییر Route اجرا می‌شود و ورود CSS پس از Mount صفحه جدید انجام می‌شود.
- وضعیت بارگذاری صفحات lazy ردیابی می‌شود؛ نخستین بازدید از صفحه‌ای که chunk آن هنوز آماده نیست از fallback CSS استفاده می‌کند و پس از آماده‌شدن محتوا وارد می‌شود، بازدیدهای بعدی از View Transition بومی بهره می‌برند.
- انیمیشن root هنگام انتقال scoped غیرفعال می‌شود تا Header و Dock محو/ظاهر نشوند.
- قاب `.route-page`، Border و RouteScrollbar بدون انیمیشن باقی می‌مانند.

### تب‌های Maze

- Glider تب‌ها از ۶۰۰ms به ۲۶۰ms کاهش پیدا می‌کند؛ تغییر رنگ و شمارندهٔ تب‌ها نیز حدود ۱۸۰ms است.
- پنل فعال با نام `maze-menu-content` انتقال می‌گیرد.
- مدت خروج پنل ۱۲۰ms و مدت ورود ۱۹۰ms است.
- مرورگرهای فاقد API از خروج CSS کوتاه و سپس ورود پنل جدید استفاده می‌کنند.
- مسئولیت زمان‌بندی در `MazeMenu` و React باقی می‌ماند؛ `CreateGameComponent` همچنان DOM-free است.
- CreateWizard و Canvas پیش‌نمایش آن از درخت React حذف یا دوباره Mount نمی‌شوند.

### دسترس‌پذیری و سازگاری

- `prefers-reduced-motion: reduce` مسیرهای متحرک را غیرفعال می‌کند.
- View Transition API فقط Progressive Enhancement است؛ در مرورگرهای قدیمی مسیر CSS/بدون انیمیشن استفاده می‌شود.
- جابه‌جایی سندی به `/maze.html` یا `/play` به منطق Soft Navigation تعمیم داده نشده است.

## فایل‌های تغییرکرده

- `src/platform/scoped-view-transition.ts` (جدید)
- `src/app/navigation.ts`
- `src/app/router.tsx`
- `src/app/route-loaders.ts` (جدید)
- `src/styles/site.css`
- `src/styles/style.css`
- `src/features/maze/styles/lobby.css`
- `src/features/maze/styles/maze-site.css`
- `src/features/maze/ui/create-game/create-game.ts`
- `src/features/maze/ui/react/MazeMenu.tsx`
- `src/features/maze/README.md`
- `scripts/check-layout.mjs`

## بخش‌های دست‌نخورده

Game Loop، Simulation، الگوریتم‌های Maze، Canvas بازی اصلی، WebSocket، Room Store، پروتکل Multiplayer، APIها، Theme Switcher، Header Coin Balance و هندسه/Scroll قاب‌های اصلی تغییر داده نشده‌اند.

## اعتبارسنجی

- `node scripts/check-layout.mjs`: موفق.
- `node scripts/check-css-duplicates.mjs`: موفق؛ ۱۹ فایل CSS بدون selector/property تکراری.
- TypeScript transpile syntax برای فایل‌های تغییرکرده: موفق.
- PostCSS parse برای چهار فایل CSS تغییرکرده: موفق.
- Typecheck کامل، Build و تست بصری مرورگر در این محیط اجرا نشدند؛ وابستگی‌های محلی (`node_modules`, Vite, PostCSS package resolution و ابزار تست) در ZIP موجود نیستند.
