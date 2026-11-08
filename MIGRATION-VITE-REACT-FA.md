# برنامه و وضعیت مهاجرت به Vite + React

## معماری مقصد

- تمام رابط کاربری سایت و بازی: React Components
- تمام مدیریت ماژول‌ها، CSS/Asset graph و Build فرانت‌اند: یک Vite در ریشه پروژه
- موتور اصلی بازی: TypeScript مستقل، تحت مدیریت Vite و متصل از طریق Adapter/Store
- Backend: Node.js و سرویس‌های فعلی، بدون بازنویسی در این مهاجرت
- قراردادهای ارتباطی: API، ساختار داده‌ها، LocalStorage و WebSocket بدون تغییر

React مسئول UI، دسترس‌پذیری و چرخه عمر کامپوننت‌ها خواهد بود. موتور بازی مسئول Simulation، Canvas، الگوریتم تولید Maze، ورودی‌های پیوسته و ارتباط Multiplayer باقی می‌ماند. انتقال Game Loop به React State ممنوع است، چون باعث Renderهای غیرضروری و افت کارایی می‌شود.

## وضعیت پیاده‌سازی در این نسخه

### انجام‌شده در فاز اول

1. یک Vite root و یک React root برای مسیرهای Frontend حفظ شده است.
2. Home shell به React منتقل شده است.
3. Navigation، منوی بازشونده، حالت موبایل، Theme Switcher و Create/Rooms/Live selector به React Components تبدیل شده‌اند.
4. Brand Header، Interaction Bar، شمارنده‌های Views/Likes/Shares، دکمه‌های Like/Share، Share Modal و Tips action به React منتقل شده‌اند.
5. مسیرهای فعلی API تعاملات (`/api/stats`, `/api/stats/view`, `/api/stats/like`, `/api/stats/share`) بدون تغییر نگه داشته شده‌اند.
6. ساختار ثابت Maze از HTML string به JSX تبدیل شده است؛ ۸۳ شناسه اصلی در JSX حفظ شده‌اند تا موتور فعلی همان عناصر مورد انتظارش را پیدا کند.
7. `MazePage` lifecycle و بارگذاری موتور را کنترل می‌کند؛ موتور TypeScript پس از Commit شدن رابط React اجرا می‌شود.
8. اسکریپت‌های قدیمی Home دیگر از مسیر فعال Home یا Maze اجرا نمی‌شوند و فقط به‌عنوان baseline/rollback باقی مانده‌اند.
9. فایل‌های Backend و قراردادهای API/WebSocket در این فاز تغییر داده نشده‌اند.

### انجام‌شده در فاز دوم — رابط بازی React

1. Create Game Wizard به React state و کامپوننت‌های کنترل‌شده منتقل شده است؛ نگه‌داشتن دکمهٔ Launch، تنظیمات بازی و ذخیره‌سازی قبلی حفظ شده‌اند.
2. Rooms browser، فیلتر چندانتخابی اندازه، جست‌وجو، مرتب‌سازی ذخیره‌شده، اتصال با کد و کارت‌های اتاق به React منتقل شده‌اند.
3. Room Details / Waiting Room، فهرست بازیکنان، وضعیت میزبان، کد دعوت، خروج و شروع اتاق به React منتقل شده‌اند.
4. Live Races، فیلترها، مرتب‌سازی، recent races و درخواست thumbnailهای قابل مشاهده به React منتقل شده‌اند.
5. `CreateGameComponent` به یک state adapter بدون DOM تبدیل شده است؛ `LobbyHub` فقط مسئول هماهنگی WebSocket، `LobbyStore` و انتشار snapshot است.
6. کلاس‌های View قدیمی و ابزارهای DOM-only جایگزین‌شده (Rooms/Room/Live Views، CardList، Toolbar، SeatBloom، Toast و کنترلرهای Wizard) از مسیر فعال حذف شده‌اند.
7. شناسه‌های DOM موردنیاز موتور حفظ شده‌اند؛ `MazeStage` و `LiveThumb` فقط Canvasهای پیش‌نمایش را رسم می‌کنند و به lifecycle کامپوننت‌های React متصل‌اند.

### انجام‌شده در فاز سوم — Race Board و HUD داخل مسابقه

1. Race Board به `RaceBoardView` تبدیل شده است؛ رندر ردیف‌ها، وضعیت انتخاب دونده، ترتیب، کلاس‌ها و فهرست اضافه‌ها را React مدیریت می‌کند. کنترل انتخاب تم نیز از state store تغذیه می‌شود و کنترلر تم دیگر کلاس/ویژگی عناصر دکمه را مستقیم تغییر نمی‌دهد.
2. کنترلر Race Board اکنون فقط دادهٔ مرتب‌شده و snapshot منتشر می‌کند؛ هیچ `createElement`، `replaceChildren` یا دستکاری `classList` در آن وجود ندارد. API مورد استفادهٔ موتور (`show` / `hide` / `render`) حفظ شده است.
3. HUD اعداد Steps، Time و Goals، درصد Zoom، تعداد Hint، وضعیت Follow/Fog و نمایش Mini Map اکنون از طریق `useSyncExternalStore` به React متصل‌اند.
4. Win Card، آمار پایان مسابقه، پیام‌های وضعیت، دکمهٔ بازگشت/شروع مجدد و پنجرهٔ تأیید پایان بازی نیز با React رندر می‌شوند؛ متن‌ها و آمار به‌صورت داده منتشر می‌شوند و `innerHTML` برای تولید UI استفاده نمی‌شود.
5. `updateHud()` همچنان در همان نقاط قبلی از Game Loop فراخوانی می‌شود؛ store فقط هنگام تغییر مقادیر قابل‌نمایش اعلان می‌دهد. منطق Simulation، `requestAnimationFrame`، Canvas renderer، WebSocket و الگوریتم‌های بازی تغییر نکرده‌اند.
6. دکمه‌ها و شناسه‌های DOM که کنترلر ورودی/بوت موتور به آن‌ها وصل می‌شود حفظ شده‌اند؛ event listenerها هنوز به همان APIهای قبلی موتور متصل‌اند.

### انجام‌شده در فاز چهارم — Site Features React

1. Home اکنون از `MarketSummary`، `LiveFeedPanel` و `HoldersPanel` تشکیل شده است؛ این سه بخش به‌طور کامل توسط React state و lifecycle مدیریت می‌شوند.
2. Market route در `/market.html` و Token/Coin route در `/coin.html` به‌عنوان ورودی‌های مستقل Vite فعال شده‌اند؛ `/holders.html` نیز صفحهٔ جداگانهٔ React برای فهرست Top 100 است.
3. `useMarketData`، `useHolders` و `LiveFeedPanel` مسئول درخواست‌ها، زمان‌بندی refresh، لغو درخواست قبلی، رد پاسخ stale و مدیریت وضعیت‌های loading/error/empty هستند.
4. Market Summary همان `GET /api/jupiter-market` با `cache: no-store`، هدر `Accept: application/json` و فاصلهٔ ۳۰ ثانیه را حفظ می‌کند. Token page نیز همان endpoint و cadence را دارد. Sparkline همان `/api/jupiter-market/history?limit=240` را با فاصلهٔ ۶۰ ثانیه فراخوانی می‌کند.
5. Holders همان `/api/live-feed/holders?limit=100` با cadence پنج‌ثانیه‌ای و منطق data-version را حفظ می‌کند. Live Feed همان buyers/holders endpointها با limit=100، request sequence، cancel و refresh پنج‌ثانیه‌ای پس از پایان درخواست را حفظ می‌کند.
6. Vite اکنون `index.html`، `market.html`، `coin.html` و `holders.html` را به‌عنوان build input می‌شناسد. این کار از طریق Multi-page frontend build انجام شده و نیازی به تغییر `server.js` نداشته است.
7. هیچ فایل `server.js`، `start.js`، `engines/`، `shared/` یا قرارداد API تغییر نکرده است؛ مسیرها، متدها، queryها و ساختار پاسخ سرویس‌ها دست‌نخورده‌اند.
8. DOM-based legacy scripts در `legacy-scripts/` و `public/js/` صرفاً برای rollback/parity نگه داشته شده‌اند و در مسیرهای فعال React import یا اجرا نمی‌شوند.

### باقی‌مانده برای رسیدن به ۱۰۰٪ React UI

1. انتقال سایر bootstrapها و بخش‌های قدیمی سایت که در archive فعلی صفحهٔ فعال ندارند، پس از شناسایی دقیق دامنهٔ موردنیاز.
2. حذف `legacy-scripts` و duplicate sourceها فقط پس از تأیید parity و تکمیل تست‌های مرورگر؛ فعلاً نگهداری‌شان عمدی است.
3. اجرای Typecheck کامل، Vite Production Build، تست API زنده و تست بصری Desktop/Tablet/Mobile در محیط دارای وابستگی‌ها.

## نقشه راه پیشنهادی

### فاز 2 و 3 — Game UI React

- Create Wizard، Rooms browser، Room Details و Live Races منتقل شده‌اند.
- Race Board، HUD، mini-map tile، Win Card، status banner و پنجرهٔ تأیید پایان بازی داخل مسابقه به React منتقل شده‌اند.

Adapterهای state/protocol حفظ شده‌اند؛ قراردادهای شبکه، Room Store و الگوریتم‌های موتور تغییر نکرده‌اند.

### فاز 4 — Site Features React

- Market / Token Summary، Token detail page، Holders و Live Feed منتقل شده‌اند.
- مسیرهای `/market.html`، `/coin.html` و `/holders.html` در ورودی‌های build فرانت‌اند فعال هستند.

### فاز 4 — حذف Legacy UI

- حذف کلاسیک‌های فعال جایگزین‌شده
- حذف DOM bootstrapهای قدیمی
- حذف duplicate sourceها
- حذف compatibility adapters غیرضروری

### فاز 5 — تست و انتشار

- Screenshot parity در viewportهای مرجع
- تست navigation و keyboard accessibility
- تست theme persistence و storage keys
- تست API endpoints و request/response behavior
- تست WebSocket handshake و message parity
- تست Create/Rooms/Live/Race، بازی Solo و Multiplayer
- تست persistence، reload، reconnect و خطاهای شبکه
- بررسی FPS، CPU، memory و عدم re-render سطح Canvas

## قراردادهای غیرقابل تغییر

| محدوده | قرارداد حفظ‌شده |
|---|---|
| Visual | CSS، layout، spacing، responsive و animation |
| API | endpoint، method، payload و response shape |
| Storage | نام کلیدها و ساختار داده‌های ذخیره‌شده |
| Maze | generator، seed/rules، save format و simulation |
| Renderer | Canvas lifecycle و frame loop |
| Input | keyboard، pointer، joystick و minimap behavior |
| Multiplayer | WebSocket URL، message types و protocol |
| Backend | Express، engines، SQLite و process startup |

## آزمون‌های فعلی و محدودیت

`node scripts/check-layout.mjs` اکنون ساختار React بازی و مسیرهای Market/Token/Holders/Live Feed را نیز بررسی می‌کند؛ این بررسی موفق است. بررسی نحوی TypeScript/TSX با transpiler سراسری TypeScript برای ۹۵ فایل انجام شد و ۱۳۷ فایل JavaScript نیز با `node --check` بدون خطا بررسی شدند. Typecheckهای هدفمند برای Race Board و HUD store، adapter مربوط به HUD، کنترلر صفحه‌کلید و کامپوننت‌های React انجام شدند؛ بررسی JSX با shim حداقلی React بود و جایگزین بررسی با declarationهای نصب‌شدهٔ `@types/react` نیست. سه تست Race Board، سه تست HUD/UI store و دو تست موجود رتبه‌بندی بازیکنان (در مجموع ۸ تست) موفق‌اند. پنج فایل هسته‌ای `frame.ts`، `update.ts`، `render.ts`، `camera.ts` و `maze-generator.ts` نسبت به ZIP فاز قبل بایت‌به‌بایت بدون تغییر مانده‌اند. برای Typecheck کامل پروژه، Vite Production Build و تست بصری مرورگر باید وابستگی‌های محلی نصب و اجرای مرورگر انجام شود. این محیط `node_modules` ندارد؛ بنابراین این سه مورد در این تحویل تأییدشده محسوب نمی‌شوند.


برای فاز Site Features، transpile نحوی ۸۰ فایل TypeScript/TSX موفق بود و `node --check` برای فایل‌های JavaScript قدیمی/public بدون خطا اجرا شد. Typecheck هدفمند Featureهای جدید با declaration shim موقت React موفق بود؛ این بررسی جایگزین typecheck واقعی با `@types/react` نصب‌شده نیست. دو فایل تست جدید برای formatterها و unwrap کردن payload بازار اضافه شده‌اند، اما به‌دلیل نبود `node_modules` اجرای Vitest در این محیط ممکن نبود. Typecheck کامل و Production Build نیز اجرا نشدند؛ بنابراین خروجی build تولیدی و visual parity مرورگر هنوز تأییدشده محسوب نمی‌شوند.

تست parity تاریخی Maze نیز به `legacy/mazeV3` نیاز دارد که در ZIP ورودی موجود نیست. نبود این baseline را نباید با ادعای parity کامل جایگزین کرد.


### بازبینی تحویل فاز چهارم

- `node scripts/check-layout.mjs` موفق است و ورودی‌های چندصفحه‌ای Vite، routeهای React و عدم import مستقیم کنترلرهای legacy را بررسی می‌کند.
- بررسی نحوی با TypeScript transpiler برای ۸۰ فایل TS/TSX زیر `src/` (به‌جز declaration files) بدون خطا انجام شد؛ `node --check` نیز برای ۷۴ فایل JavaScript در `public/js/` و `legacy-scripts/` موفق بود.
- Typecheck هدفمند Featureهای جدید با React declaration shim موقت موفق شد. این نتیجه جایگزین Typecheck کامل با وابستگی‌های واقعی پروژه نیست.
- `server.js`، `start.js`، `engines/`، `shared/` و `src/services/api/contracts.ts` با نسخهٔ ورودی مقایسه شدند و بدون تغییر هستند.
- در محیط فعلی `node_modules` نصب نیست: Typecheck کامل به‌دلیل نبود `@types/node` و `vite/client` اجرا نشد؛ Vite Build و Vitest نیز به‌ترتیب به‌دلیل در دسترس نبودن `vite` و `vitest` اجرا نشدند. تست بصری مرورگر و تست زندهٔ API هم انجام نشده‌اند.
