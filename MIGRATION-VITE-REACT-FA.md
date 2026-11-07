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

### باقی‌مانده برای رسیدن به ۱۰۰٪ React UI

1. بازنویسی Create Game wizard، Slider/Dial/Ruler و Step Rail به React State و Components.
2. بازنویسی Lobby، Rooms، Room Details، Live Races و Race UI به React.
3. انتقال نمایش HUD، Toolbar، Theme controls داخل بازی، modalها و وضعیت‌های نمایشی به React؛ Canvas و ورودی‌های پیوسته همچنان سرویس‌های TypeScript مستقل بمانند.
4. ساخت Routeهای واقعی و React Features برای Coin/Token، Holders، Market، Live Feed و سایر صفحات/بخش‌هایی که در این سورس وجود دارند یا توسط لینک‌های فعلی ارجاع می‌شوند.
5. انتقال تمامی UIهای پویا از `document.createElement`, `innerHTML`, `replaceChildren` و دستکاری مستقیم classها به React. DOM imperatives فقط برای Canvas/renderer و bridgeهای فنی محدود مجازند.
6. حذف `legacy-scripts` و کدهای UI قدیمی فقط پس از تکمیل parity و اطمینان از عدم وابستگی runtime.

## نقشه راه پیشنهادی

### فاز 2 — Game UI React

- Create Wizard و تنظیمات بازی
- Rooms browser و Room Details
- Live view و live cards
- Lobby state و filters/sorting
- Race Board و HUD

در این فاز Adapterهای موجود به‌عنوان مرز حفظ می‌شوند؛ قراردادهای شبکه، Room Store و موتور دست‌نخورده باقی می‌مانند. برای هر Feature باید ورودی/خروجی state و رویدادهای قبلی قبل از جایگزینی ثبت شوند.

### فاز 3 — Site Features React

- Market / Price / Liquidity
- Token Summary و Mint controls
- Holders و classification/ranking views
- Live Feed و interactions مرتبط
- Coin/Token page و مسیرهای آن

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

`npm run check:layout` بدون نصب وابستگی‌ها قابل اجراست و ساختار پایه را کنترل می‌کند. برای TypeScript، Build و تست‌های کامل باید ابتدا `npm install` موفق اجرا شود. در زمان آماده‌سازی این نسخه، نصب وابستگی‌ها در محیط اجرایی به timeout برخورد کرد؛ بنابراین `vite build`, `tsc` و تست مرورگر در این محیط تأیید نشده‌اند.

تست parity تاریخی Maze نیز به `legacy/mazeV3` نیاز دارد که در ZIP ورودی موجود نیست. نبود این baseline را نباید با ادعای parity کامل جایگزین کرد.
