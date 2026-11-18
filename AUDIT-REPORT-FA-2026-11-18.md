# گزارش ممیزی و پاک‌سازی تداخل‌ها — Maze / Hollld

**منبع بررسی:** آخرین فایل ارسالی `maze-main(3).zip`  
**تاریخ:** ۱۸ نوامبر ۲۰۲۶  
**نوع خروجی:** پچ محدود شامل فایل‌های تغییر‌یافته/جدید؛ سورس کامل پروژه در ZIP قرار ندارد.

## نتیجه کلی

در نسخه ارسالی، تداخل فقط به Grid هدر محدود نبود. چند منبع حقیقت موازی برای چیدمان، رنگ‌بندی، routeها، endpointهای API، عنوان صفحه و تعدادی rule و animation در CSS وجود داشت. مواردی که واقعاً یک مسئولیت را تکرار یا بازنویسی می‌کردند پاک‌سازی شدند و برای جلوگیری از برگشت آن‌ها چند بررسی خودکار به `npm run check` افزوده شد.

پاک‌سازی با هدف حفظ رفتار موجود انجام شده است؛ مسیر و متد endpointها تغییر نکرده‌اند، منطق اتصال Reown بازنویسی نشده و Game Loop، Simulation، الگوریتم‌های Maze، Room Store و پروتکل WebSocket دست‌کاری نشده‌اند.

## مواردی که پیدا و اصلاح شدند

### ۱. هدر و ظاهر

- مالکیت Grid اصلی هدر در `src/styles/site.css` متمرکز شد. `src/styles/style.css` دیگر Grid، `grid-area` یا layout موازی برای `.nav-inner` تعریف نمی‌کند.
- منوی بازی و تغییر تم زیر والد مشترک `.nav-secondary-row` قرار دارند؛ فاصله آن‌ها با `gap: 6px` کنترل می‌شود و به عرض لینک‌های ردیف بالایی وابسته نیست.
- نمایش Wallet و دکمه منوی موبایل در گروه مستقل `nav-utilities` باقی مانده است.
- CSS ظاهری switcherها و رنگ‌بندی آن‌ها تفکیک شد: `style.css` مسئول geometry/typography و `arena.css` مسئول theme color و stateهای عادی، hover و active است.
- declarationهایی که در `arena.css` با selector قوی‌تر بی‌اثر یا بازنویسی می‌شدند از لایه پایه حذف شدند؛ از جمله رنگ و background تکراری گزینه‌های Game/Theme و بخشی از استایل‌های لینک و Wallet.
- قانون تکراری `z-index` برای `body.in-menu #site-header` از inline style در `index.html` و فایل Maze حذف و در CSS سراسری هدر متمرکز شد.
- استایل‌های Hover خالی و چند declaration بدون اثر حذف شدند.

### ۲. ممیزی سراسری CSS فعال

- تمام ۱۸ stylesheet قابل‌دسترسی از entry pointهای واقعی برنامه بررسی شدند؛ هر ۱۸ فایل در graph فعال هستند.
- ۱۷ تعریف تکراری `@keyframes` از `maze-site.css` حذف شد. انیمیشن‌های `cg*` فقط در `create-game.css` و انیمیشن‌های `lb*` فقط در `lobby.css` باقی مانده‌اند.
- تعریف‌های تکراری Montserrat در CSS Maze حذف شدند؛ مالک فونت عمومی سایت `src/styles/style.css` است.
- ۵۵ custom property تعریف‌شده که در هیچ فایل CSS/TS/TSX/JS/HTML پروژه مصرف نمی‌شدند حذف شدند. متغیرهای theme که واقعاً مصرف دارند حفظ شده‌اند.
- declarationهای تکراری یا superseded پاک‌سازی شدند. fallbackهای مرورگر که قبلاً با declaration پشت‌سرهم نوشته شده بودند (مانند `vh/dvh` و `overflow:hidden/clip`) به `@supports` صریح منتقل شدند تا پشتیبانی قدیمی حفظ شود، اما Cascade دوگانه و مبهم نماند.
- فایل قدیمی و بدون ارجاع `src/features/maze/styles/style.css` حذف شده است. ورودی یگانه CSS مربوط به Maze، `src/features/maze/styles/index.css` است.
- shared feature primitives در `home-shared.css` یک مالک دارند؛ `feature-pages.css` فقط استایل اختصاصی صفحات feature را نگه می‌دارد.
- اسکریپت جدید `scripts/check-css-duplicates.mjs` اکنون تکرار selector/property در context یکسان، نام تکراری keyframes و font-faceهای یکسان را تشخیص می‌دهد. این بررسی به `npm run check` متصل شده است.

### ۳. Route و عنوان صفحات

- تعریف مسیرهای Home، Maze، Coin/Token، Holders، Market و Profile در `shared/site-routes.json` متمرکز شد.
- React Router، soft navigation، SiteNavigation، GameViewSwitcher، لینک‌های داخلی، Wallet Profile link و Express از همان manifest استفاده می‌کنند.
- alias قدیمی `/play` حفظ شد و در manifest ثبت شده است. Vite مسیرهای Maze را از manifest به bootstrap اولیه HTML تزریق می‌کند؛ بنابراین aliasها در اولین paint نیز درست شناسایی می‌شوند.
- منطق تشخیص مسیر Maze که در چند کامپوننت تکرار شده بود از manifest استفاده می‌کند.
- مالک عنوان پویای صفحه فقط `App.tsx` است. عنوان اولیه سند (`<title>`) نیز در `index.html` دیگر مقدار مستقل ندارد و در زمان transform توسط Vite از عنوان Home در `shared/site-routes.json` تزریق می‌شود؛ بنابراین مقدار پیش‌فرض و عنوان route جاری دو نقش مجزا با یک منبع مرجع دارند. assignment جداگانه عنوان Maze از inline script در `index.html` حذف شد.
- برای Maze یک route shell سازگار با portal موجود در `App.tsx` تعریف شد؛ Route دیگر Maze را اشتباهاً HomePage فرض نمی‌کند.

### ۴. API و backend route contract

- ۱۶ مسیر API در `shared/api-routes.json` تعریف شده‌اند.
- `src/services/api/contracts.ts` و `server.js` هر دو همان manifest را مصرف می‌کنند؛ مسیرهای API به‌صورت رشته ثابت در هر دو سمت تکرار نمی‌شوند.
- مصرف‌کننده‌های React به `API_PATHS` متصل شده‌اند: InteractionBar، LiveFeedPanel، useHolders، CoinPage و useMarketData.
- path، HTTP method، query limitها و منطق handlerها تغییر نکرده‌اند؛ فقط محل تعریف pathها مشترک شده است.

### ۵. Build و اجرای تست‌ها

- فرمان `npm run check` قبلاً پس از `build:all` دوباره از مسیر `test:all`، build مربوط به Maze Server را اجرا می‌کرد. اکنون بعد از build اصلی مستقیماً `test:maze:run` اجرا می‌شود و build تکراری حذف شده است. اجرای مستقل `npm run test:maze` همچنان ابتدا Maze Server را build می‌کند.
- تست جدید `src/app/routes.test.ts` قرارداد مسیرها و aliasها را بررسی می‌کند.
- تست موجود `step-icons.test.ts` از قرارداد route manifest استفاده می‌کند، نه جزئیات پیاده‌سازی قدیمی Router.
- `check-layout.mjs` اکنون یکتایی Route/API manifest، یک‌مالک بودن عنوان، تزریق مسیر Maze به HTML، مالکیت Grid هدر و اتصال CSS duplicate check به `npm run check` را کنترل می‌کند.

## مواردی که عمداً تکرارزدایی نشدند

این موارد از نظر ظاهری یا نام‌گذاری شبیه‌اند، اما نقش متفاوت و لازم دارند:

- bootstrap همگام theme در `index.html` برای جلوگیری از theme flash قبل از CSS و React است؛ `ThemeBridgeProvider` بعداً وضعیت React را با همان theme سند همگام می‌کند. این‌ها دو مالک مستقل برای رنگ نیستند.
- tokenهای `html[data-theme="grass|dark|light"]` مقادیر متفاوت برای سه تم‌اند و تکرار یک تعریف واحد محسوب نمی‌شوند.
- قوانین media query در عرض‌های متفاوت، fallbackها و enhancementهای `@supports` برای مرورگرها و viewportهای متفاوت‌اند؛ حذف کورکورانه آن‌ها رفتار responsive را خراب می‌کند.
- listenerهای `visibilitychange` در featureهای Market، Holders و Interaction وظایف و pollerهای مستقل دارند؛ ادغام اجباری آن‌ها می‌تواند زمان‌بندی یا رفتار داده را تغییر دهد.
- مسیر `/health` در تست‌های Maze Server متعلق به سرویس multiplayer جداگانه است و با `/health` مربوط به Express وب یکی نیست؛ این دو endpoint از نظر host/service قرارداد متفاوت دارند.
- کامپوننت‌های Theme سایت و Theme داخل Maze از نظر state و مصرف‌کننده‌ها پل دارند، اما UI و lifecycle آن‌ها یکی نیست؛ sync موجود حفظ شده است.

## فایل‌های حذف‌شده

ZIP نمی‌تواند فایل موجود را هنگام extract خودکار حذف کند. پس از اعمال پچ، فایل زیر را مطابق `DELETE-MANIFEST.txt` دستی حذف کنید:

- `src/features/maze/styles/style.css` — stylesheet قدیمی و بدون import؛ ورودی CSS Maze اکنون `src/features/maze/styles/index.css` است.

## اعتبارسنجی اجراشده

| بررسی | نتیجه |
|---|---|
| `node scripts/check-layout.mjs` | موفق |
| `scripts/check-css-duplicates.mjs` روی ۱۸ stylesheet فعال | موفق؛ بدون selector/property تکراری در context یکسان، keyframes یا font-face تکراری |
| `node --check` برای server/start/scripts/test runnerها | موفق |
| بررسی syntax با TypeScript transpile روی ۱۰۵ فایل TS/TSX/MTS | موفق؛ بدون diagnostic نحوی |
| `node --check` روی ۶ فایل JS/MJS مربوط به سرور و ابزارها | موفق |
| یکتایی ۱۰ route path و ۱۶ API path | موفق |

### محدودیت اعتبارسنجی

اسکن خودکار CSS تکرار دقیق selector/property را در context یکسان، نام‌های تکراری `@keyframes` و signatureهای تکراری `@font-face` تشخیص می‌دهد؛ این ابزار به‌تنهایی تمام برخوردهای معنایی بین selectorهای متفاوت با specificityهای متفاوت یا کلاس‌های runtime را اثبات/رد نمی‌کند. موارد شناخته‌شده در هدر، Maze styles، رنگ‌بندی و ورودی‌های مشترک دستی هم بازبینی شدند. به همین دلیل نتیجه این گزارش یک ممیزی استاتیک گسترده است، نه تضمین ریاضیِ نبود هر نوع تداخل احتمالی در همه مسیرهای runtime.

Build، Typecheck کامل و تست‌های runtime در این محیط قابل اجرا نبودند؛ ZIP وابستگی‌های نصب‌شده ندارد:

- Typecheck به دلیل نبود `@types/node` و `vite/client` متوقف شد.
- `build:all` به دلیل نبود `esbuild` متوقف شد؛ Vite نیز در محیط نصب نبود.
- Vitest نصب نبود و تست‌های Maze به `tsx` نصب‌نشده نیاز داشتند.
- تست بصری در مرورگر و اجرای واقعی Reown/Wallet، WebSocket و بازی انجام نشده است.

بنابراین syntax و قراردادهای ایستا تأیید شده‌اند، اما Build تولیدی و رفتار مرورگر هنوز تأیید نهایی نشده‌اند. نسخه پروژه در `package.json`، Node `22.23.4` را اعلام می‌کند؛ محیط این ممیزی Node `22.16.0` داشت.

## روش اعمال پچ

۱. از پروژه فعلی backup یا یک branch مستقل بگیرید.  
۲. فایل‌های ZIP را در ریشه repository استخراج و جایگزین کنید.  
۳. فایل ذکرشده در `DELETE-MANIFEST.txt` را حذف کنید.  
۴. با نسخه Node مطابق پروژه و پس از نصب dependencies اجرا کنید:

```powershell
npm ci
npm run check
```

۵. پس از Build موفق، مسیرهای `/`, `/maze.html`, `/play`, `/token`, `/holders`, `/market` و `/profile` و همچنین سه theme را در مرورگر بررسی کنید.
