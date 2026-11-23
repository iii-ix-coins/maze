# گزارش بازآرایی CSS پروژه Maze

تاریخ: ۲۳ نوامبر ۲۰۲۶

## جمع‌بندی

تمام فایل‌های CSS موجود در پروژه بررسی شدند. ساختار از ۲۱ فایل CSS اولیه به ۱۸ فایل فعال و هدفمند رسیده است. چهار فایل قدیمی/موازی حذف و یک فایل مشخص برای مالکیت توکن‌های تم ایجاد شد. حجم کل CSS از ۴۰۱٬۲۱۰ به ۳۴۸٬۳۸۶ بایت (۵۲٬۸۲۴ بایت، حدود ۱۳٫۲٪ کاهش) و تعداد خطوط از ۱۴٬۶۰۷ به ۱۳٬۶۹۲ (۹۱۵ خط کاهش) رسیده است؛ این ارقام از فهرست فایل‌های ZIP اولیه و نسخهٔ خروجی محاسبه شده‌اند.

## تغییرات ساختاری

- `src/styles/arena.css` حذف شد. این فایل هم‌زمان توکن‌های تم، selectorهای عمومی و overrideهای گستردهٔ کامپوننت‌ها را نگه می‌داشت و چون در انتهای `site.css` وارد می‌شد، می‌توانست ظاهر بخش‌های دیگر را با specificity و cascade دوباره بازنویسی کند.
- توکن‌های رنگ، سطح، سایه، تایپوگرافی معنایی، Hero و Navigation به `src/styles/theme-tokens.css` منتقل شدند. این فایل فقط قرارداد توکن‌ها را نگه می‌دارد و محل تعریف ظاهر کامپوننت‌ها نیست.
- قواعد مشترک پوستهٔ صفحات Explore/Profile در `src/styles/home-shared.css` یکپارچه شدند؛ فایل موازی `src/styles/feature-pages.css` حذف شد و هر صفحه CSS مختص خودش را در feature خود دارد.
- قواعد React مربوط به Create Game و Lobby از `src/features/maze/ui/react/maze-menu.css` به فایل‌های مالک (`create-game.css` و `lobby.css`) منتقل شدند. فایل override کوچک و جداگانه حذف شد.
- `public/css/maze-style.css` که از مسیر فعال برنامه استفاده نمی‌شد حذف شد.
- `home-style.css` مالک افکت‌های اختصاصی Home شد؛ تنظیمات Hero در فایل کامپوننت Hero باقی ماند؛ قواعد مشترک و Dock در فایل‌های سراسری و پوسته قرار گرفتند.
- paletteهای قبلی از `maze-camera.css` جدا شدند تا این فایل فقط مسئول backdrop و camera/runtime presentation باشد.
- قواعد مربوط به برند قدیمی، توضیحات برند، footer قدیمی و mobile nav toggle که دیگر در DOM React استفاده نمی‌شدند حذف شدند.

## مالکیت نهایی فایل‌ها

### پوسته و پایهٔ سایت

| فایل | مسئولیت |
|---|---|
| `src/styles/theme-tokens.css` | paletteها و semantic design tokens برای سه تم |
| `src/styles/style.css` | cascade layers، reset، پایهٔ تایپوگرافی، FX و primitives مشترک |
| `src/styles/site.css` | import graph پوسته، میزبان لوگو، Dock، Notification و Theme slot |
| `src/styles/header-scroll-scrim.css` | scrim و رفتار دیداری header هنگام scroll |
| `src/styles/maze-camera.css` | پس‌زمینه و لایه‌های camera/canvas مربوط به Maze |
| `src/styles/page-loader.css` | loader سراسری |
| `src/styles/page-transition.css` | transition بین مسیرها |
| `src/styles/home-shared.css` | shell مشترک صفحات feature |

### Home و صفحات مستقل

| فایل | مسئولیت |
|---|---|
| `src/styles/home-style.css` | اجزای اختصاصی Home |
| `src/components/home/home-hero-slider.css` | فقط ظاهر Hero Slider |
| `src/features/explore/explore-page.css` | فقط Explore |
| `src/features/profile/profile-page.css` | فقط Profile |

### Maze

| فایل | مسئولیت |
|---|---|
| `src/features/maze/styles/index.css` | تنها entrypoint CSS فیچر Maze |
| `maze-site.css` | لایهٔ پایه و سازگاری UI موجود Maze |
| `maze-unify.css` | bridge صریح cascade برای قواعد حساس به ترتیب/لایه |
| `maze-theme.css` | theme و حالت‌های دیداری Maze |
| `create-game.css` | Create Game و کنترل‌های React آن |
| `lobby.css` | Lobby، Room UI و کنترل‌های React آن |

## Overrideهای باقی‌مانده و تصمیم‌های عمدی

- `maze-site.css` همچنان فایل بزرگی است. در این مرحله آن را حذف یا به چندین فایل جدید خرد نکردم، چون بررسی selectorها نشان داد بخشی از قواعد پایهٔ `.maze-app`، Create Game و Lobby هنوز منحصربه‌فردند. جابه‌جایی گستردهٔ آن بدون snapshot مرورگر و تست بصری می‌تواند UI بازی را تغییر دهد.
- `maze-unify.css` عمداً به‌عنوان پل cascade باقی مانده است؛ توضیح ترتیب و دلیل آن در خود فایل حفظ شده است. این فایل نباید به یک override عمومی برای کل سایت تبدیل شود.
- `style.css` هنوز قواعد پایهٔ ناوبری مشترک را نگه می‌دارد؛ `site.css` ظاهر Dock فعلی را با selectorهای scoped به `.site-bottom-nav` مالکیت می‌کند. این جداسازی برای حفظ کلاس‌های مشترک و حالت Maze است.
- این پاک‌سازی تمام اختلاف‌های بصری ناشی از selectorهای متفاوت و specificity متفاوت را به‌صورت ریاضی اثبات نمی‌کند؛ اسکنر تکرار دقیق declaration را کنترل می‌کند. برای حذف باقی‌ماندهٔ bridgeهای Maze، تست screenshot/visual regression لازم است.

## کنترل‌های انجام‌شده

- `node scripts/check-layout.mjs` — موفق
- `node scripts/check-css-duplicates.mjs` — موفق؛ ۱۸ فایل فعال، بدون تکرار selector/property در context یکسان، keyframe تکراری یا font-face تکراری
- اصلاح `scripts/check-css-duplicates.mjs` برای پوشش entrypointهای Explore و Profile علاوه بر Site، Home و Maze
- افزودن guard به `scripts/check-layout.mjs` برای جلوگیری از بازگشت فایل‌های قدیمی و تضمین مالکیت `theme-tokens.css`
- تمام ۱۸ فایل CSS فعال در graph اسکن‌شده با PostCSS parse شدند.

## موارد اجرا نشده

Production Vite build اجرا نشد: دستور `npm run build:site` با خطای `vite: not found` متوقف شد، چون `node_modules/.bin/vite` در محیط موجود نیست. تست بصری مرورگر نیز اجرا نشد؛ بنابراین ظاهر نهایی در viewportهای مختلف تأیید بصری نشده است. پیش از حذف بیشتر قواعد پایهٔ Maze، پس از نصب وابستگی‌ها باید build و مقایسهٔ screenshot در desktop/mobile انجام شود.
