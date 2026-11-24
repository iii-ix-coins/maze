# اصلاح فشرده‌سازی و یکسان‌سازی Navigation

## مبنا

این تغییرات روی `Site-online.zip` اعمال شده‌اند.

## لوگو و Header

- علت محو شدن لوگو این بود که `ThemedSvgIcon` یک `span` با CSS mask است، نه یک تصویر دارای اندازهٔ ذاتی؛ `width: auto` می‌توانست آن را به عرض صفر جمع کند.
- اندازهٔ لوگو اکنون صریح و متناسب با نسبت واقعی SVG تعریف شده است.
- Desktop: لوگو `74 × 18px` و قاب Header برابر نصف Dock یعنی `22.5px` است.
- Mobile: لوگو `62 × 15px` و قاب Header برابر نصف Dock یعنی `19.5px` است.
- فاصلهٔ افقی لوگو از لبهٔ داخلی قاب ۳ پیکسل است.

## Navigation و ابعاد

- ارتفاع خارجی Dock در Desktop برابر `45px` است.
- ارتفاع پایهٔ Dock در Mobile برابر `39px` است و Safe Area پایین به ارتفاع بیرونی اضافه می‌شود.
- `.nav-inner` دارای Padding برابر `3px` در چهار طرف است؛ در موبایل Padding پایین به اندازهٔ Safe Area افزایش می‌یابد.
- `--site-dock-item-size` از ارتفاع Dock منهای ۶ پیکسل محاسبه می‌شود: ۳۹ پیکسل در Desktop و ۳۳ پیکسل در Mobile.
- همهٔ شش دکمهٔ اصلی ارتفاع ۱۰۰٪ فضای داخلی و نسبت ۱:۱ دارند.
- Notifications wrapper نیز ارتفاع ۱۰۰٪ دارد و دکمهٔ آن همان ابعاد و قرارداد مشترک را مصرف می‌کند.
- Theme Switcher سه خانهٔ مربع ۱۲ پیکسلی در Desktop و ۱۰ پیکسلی در Mobile دارد؛ مجموع ردیف‌ها و فاصله‌ها برابر ارتفاع داخلی Dock است.

## یکسان‌سازی Create

- گرادیان طلایی از پس‌زمینهٔ Create حذف شد.
- کلاس اختصاصی `nav-dock-create-icon` حذف شد.
- Create اکنون از همان `.nav-dock-icon` و `ThemedSvgIcon` با Tone پیش‌فرض Primary استفاده می‌کند.
- توکن‌های بلااستفادهٔ `--create-button-gradient`، `--create-button-foreground` و `--svg-icon-create` حذف شدند.
- Notifications و Create از قوانین پایهٔ مشترک `.nav-link` استفاده می‌کنند.

## فایل‌های تغییرکرده

- `src/styles/site.css`
- `src/styles/theme-tokens.css`
- `src/styles/style.css`
- `src/components/navigation/SiteNavigation.tsx`
- `src/components/media/ThemedSvgIcon.tsx`
- `scripts/check-layout.mjs`
- `scripts/check-svg-theme.mjs`
- `src/styles/README.md`
- `SITE-THREE-FRAME-LAYOUT-FA.md`
- `THEME-TRANSPARENT-SURFACES-GOLD-CREATE-FA.md`

## اعتبارسنجی

- `npm run check:layout`: موفق.
- `npm run check:css:duplicates`: موفق؛ ۱۹ فایل CSS فعال بدون تکرار selector/property، keyframe یا font-face.
- `npm run check:svg-theme`: موفق؛ سه هشدار دربارهٔ فایل‌های پس‌زمینهٔ قدیمی و از قبل مفقود `3D-bg-*`.
- دو فایل TSX اصلاح‌شده با TypeScript `transpileModule` از نظر نحو بررسی شدند: موفق.
- `npm run typecheck`: اجرا شد ولی به‌دلیل نبود `@types/node` و `vite/client` شکست خورد.
- `npm run build:site`: اجرا شد ولی `vite` نصب نیست (`vite: not found`).
- تست بصری واقعی در مرورگر اجرا نشده است.
