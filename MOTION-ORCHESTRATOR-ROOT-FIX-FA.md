# اصلاح ریشه‌ای ناهماهنگی انیمیشن ورود/خروج محتوا

## تشخیص علت

ناهماهنگی از سه مسیر مستقل ایجاد می‌شد:

1. `startContentViewTransition` وقتی Native View Transition یا WAAPI دیگری فعال بود `false` برمی‌گرداند. مصرف‌کننده‌های مهمی مانند `IdentityProvider`، `MazeFrame` و `MazeMenu` در این حالت State را مستقیماً Commit می‌کردند؛ در نتیجه Logout/Login و تغییر محتوای بازی بدون انیمیشن انجام می‌شد.
2. Navigation برای Routeهایی که Lazy Chunk آن‌ها هنوز آماده نبود، به‌جای Coordinator از Timer خروج ۱۳۰ms و CSS fallback استفاده می‌کرد؛ Routeهای آماده‌شده از Native View Transition استفاده می‌کردند. این دو مسیر رفتار یکسانی نداشتند.
3. زمان‌ها بین CSS، Native View Transition و WAAPI پراکنده بودند: خروج ۱۳۰ms، ورود ۲۲۰ms و Theme حدود ۱۶۰ms. WAAPI نیز اعداد را جداگانه در TypeScript نگه می‌داشت.

## معماری اصلاح‌شده

### یک صف سریالی در Transition Coordinator

`src/platform/transition-coordinator.ts` اکنون تنها مالک Transitionهای محتوایی و Theme درون‌سندی است.

- درخواست پذیرفته‌شده به‌دلیل فعال بودن درخواست دیگر رد نمی‌شود.
- هر درخواستی که فعال شود Update خود را دقیقاً یک‌بار Commit می‌کند؛ `updateApplied` از اجرای دوباره در مسیرهای خطا/Recovery جلوگیری می‌کند. درخواست‌های منتظر و قابل جایگزینی با کلید یکسان عمداً به آخرین intent ادغام می‌شوند و مقصد منسوخ اجرا نمی‌شود.
- درخواست‌های منتظر با `key` یکسان، با آخرین درخواست جایگزین می‌شوند؛ Navigation و Theme از این coalescing استفاده می‌کنند. ناوبری سندی نیز تا خالی‌شدن کامل صف Transitionهای درون‌سندی منتظر می‌ماند و با Transition محتوایی هم‌پوشانی پیدا نمی‌کند.
- درخواست Logout/تغییر هویت به‌صورت `urgent` وارد صف می‌شود و در صورت امکان فاز بصری درخواست عادی فعال را با `skipTransition()` یا لغو WAAPI کوتاه می‌کند. Update فعال همچنان دقیقاً یک‌بار اعمال می‌شود.
- Transitionهای هم‌زمان شروع نمی‌شوند؛ درخواست بعدی پس از پایان یا Recovery درخواست فعال آغاز می‌شود.
- `prefers-reduced-motion` حفظ شده است؛ در این حالت Update بدون انیمیشن انجام می‌شود.
- اگر Animation شکست بخورد، Update برنامه حذف نمی‌شود و صف آزاد خواهد شد.

### یک منبع زمان‌بندی

توکن‌های مرکزی در `src/styles/style.css`:

```css
:root {
  --motion-route-duration: 220ms;
  --motion-route-easing: cubic-bezier(.22, 1, .36, 1);
  --motion-route-distance: 7px;
  --motion-route-exit-distance: 5px;
  --motion-theme-duration: 160ms;
}
```

CSS Native View Transition و CSS ورود اولیه، مستقیماً از همین متغیرها استفاده می‌کنند. WAAPI نیز مقدار محاسبه‌شده‌ی همین توکن را می‌خواند؛ چون دو فاز خروج و ورود آن پشت‌سرهم اجرا می‌شوند، بودجه‌ی کل ۲۲۰ میلی‌ثانیه را به دو فاز ۱۱۰ میلی‌ثانیه‌ای تقسیم می‌کند. در View Transition بومی، Snapshot قدیمی و جدید هم‌زمان در همان ۲۲۰ میلی‌ثانیه انیمیت می‌شوند. بنابراین مدت کل حرکت در دو پیاده‌سازی یکسان است، نه دو برابر در fallback.

### حذف مسیر موازی Lazy Route

`src/app/navigation.ts` اکنون ابتدا Chunk مقصد را با `preloadSiteRoutePage()` آماده می‌کند و سپس فقط از `startContentViewTransition()` درخواست می‌دهد. Timer خروج ۱۳۰ms، CSS fallback مختص Lazy Route و `onAnimationEnd` برای پاک‌کردن فلگ آن حذف شدند.

درخواست‌های Navigation تا زمان آماده‌شدن Chunk نسخه‌گذاری می‌شوند؛ درخواست قدیمی نمی‌تواند پس از درخواست جدید Route کهنه‌ای را Commit کند. درخواست منتظر با کلید `navigation` قابل coalesce/cancel است.

### مالکیت هویت و صفحات بازی

- `IdentityProvider` برای تغییر هویت کلید `identity` می‌فرستد.
- Logout، Session نامعتبر و پاسخ 401 اولویت `urgent` دارند.
- درخواست‌های قدیمی Identity هنگام اجرای callback با `requestVersion` بررسی می‌شوند تا پاسخ منقضی نتواند State جدیدتر را بازنویسی کند.
- Logout درخواست‌های معوق `maze-menu` و `maze-engine-ready` را لغو می‌کند.
- `MazeMenu` و `MazeFrame` همچنان از همان Coordinator استفاده می‌کنند؛ هیچ سیستم موازی برای آن‌ها اضافه نشده است.
- منطق Engine، Game Loop، WebSocket، Room Store و Backend تغییر نکرده‌اند.

## فایل‌های تغییرکرده

- `src/platform/transition-coordinator.ts`
- `src/platform/transition-coordinator.test.ts` (۹ تست برای صف سریالی، wait-for-idle، coalescing، اولویت Logout، هم‌زمانی Theme/Content، تقسیم زمان WAAPI، Reduced Motion، پیش‌دستی WAAPI و بازیابی پس از خطای Update)
- `src/platform/identity/IdentityProvider.tsx`
- `src/app/navigation.ts`
- `src/app/router.tsx`
- `src/features/maze/MazeFrame.tsx`
- `src/features/maze/ui/react/MazeMenu.tsx`
- `src/styles/style.css`
- `scripts/check-layout.mjs`
- `MOTION-SYSTEM-UPDATE-FA.md`
- `TRANSITION-COORDINATOR-ARCHITECTURE-FA.md`

## اعتبارسنجی انجام‌شده

- `node scripts/check-layout.mjs`: موفق.
- `node scripts/check-css-duplicates.mjs`: موفق؛ ۲۰ فایل CSS فعال.
- `node scripts/check-svg-theme.mjs`: موفق.
- TypeScript check مستقل برای Coordinator و تست آن با TypeScript 5.8.3 و Stubهای تست: موفق.
- اجرای دستی Scheduler Native: صف سریالی، coalescing مقصد Navigation و اولویت Logout موفق.
- اجرای دستی Scheduler WAAPI: فاز خروج و ورود هرکدام ۱۱۰ms از بودجه‌ی کل ۲۲۰ms را مصرف کردند؛ Update دقیقاً یک‌بار Commit شد؛ Logout فوری فاز بصری قبلی را لغو کرد و بدون حذف Update اجرا شد.
- تست صف بیکار: `waitForTransitionQueueIdle()` فقط پس از پایان آخرین درخواست پذیرفته‌شده Resolve می‌شود؛ ناوبری سندی قبل از انیمیشن خروج منتظر همین قرارداد می‌ماند.
- Parse نحوی فایل‌های TypeScript/TSX تغییرکرده: بدون خطا.
- PostCSS Parse فایل CSS اصلی تغییرکرده: بدون خطا.

## محدودیت اعتبارسنجی

`npm ci` به‌علت خطای DNS شبکه (`EAI_AGAIN` از npm registry) کامل نشد. پروژه نسخه‌ی Node `22.23.4` را در `.nvmrc` مشخص کرده، اما محیط حاضر `22.16.0` دارد. تلاش برای `npm run build:all` نیز به‌دلیل نصب ناقص وابستگی‌ها پیش از اجرای Build، در نبود `node_modules/esbuild` متوقف شد؛ این نتیجه، خطای Build سورس را اثبات نمی‌کند. بنابراین Vite Production Build، Typecheck سراسری با وابستگی‌های واقعی و اجرای خود Vitest/Browser E2E در این محیط تأیید نشده‌اند. فایل ۹ تستی Vitest اضافه شده و TypeScript آن با Stubهای تست بررسی شده، اما اجرای Vitest را موفق اعلام نمی‌کنیم.

## معیار پذیرش در CI/مرورگر

1. اجرای کامل `npm ci` با Node `22.23.4` و سپس `npm run check`.
2. تست ۱۰۰ چرخه Login/Logout و Route Navigation در یک مرورگر ثابت؛ هیچ Update نباید گم یا دوبار اجرا شود.
3. هم‌زمانی Navigation، Theme و Logout؛ Logout باید قبل از درخواست‌های نمایشی منتظر اجرا شود.
4. تست مرورگر بدون Native View Transition برای تأیید WAAPI fallback و `prefers-reduced-motion`.
