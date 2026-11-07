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

### باقی‌مانده برای رسیدن به ۱۰۰٪ React UI

1. انتقال Race Board، HUD و وضعیت‌های قابل‌نمایش داخل مسابقه به React؛ loop، Canvas، ورودی‌های پیوسته و Simulation همچنان در موتور مستقل می‌مانند.
2. ساخت Routeها و React Features کامل برای Coin/Token، Holders، Market، Live Feed و سایر بخش‌های سایت.
3. انتقال هر UI پویا و bootstrap باقی‌مانده از اسکریپت‌های قدیمی؛ دستکاری DOM فقط برای Canvas/renderer و bridgeهای فنی مجاز باقی می‌ماند.
4. حذف کامل `legacy-scripts` و duplicate sourceها پس از پایان parity و تست‌های مرورگر.

## نقشه راه پیشنهادی

### فاز 2 — Game UI React (بخش Lobby تکمیل شد)

- Create Wizard، Rooms browser، Room Details و Live Races منتقل شده‌اند.
- Race Board و HUD داخل مسابقه هنوز در صف انتقال هستند.

Adapterهای state/protocol حفظ شده‌اند؛ قراردادهای شبکه، Room Store و الگوریتم‌های موتور تغییر نکرده‌اند.

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

`node scripts/check-layout.mjs` بدون نصب وابستگی‌ها اجرا شد و ساختار React، حفظ ۸۳ شناسهٔ DOM، وجود چهار نمای React و DOM-free بودن CreateGameComponent/LobbyHub را تأیید کرد. Syntax تعداد ۶۶ فایل TypeScript/TSX با transpiler سراسری TypeScript و Syntax فایل‌های JavaScript با `node --check` بدون خطا بررسی شد. ۸ تست واحد Room Store و رتبه‌بندی بازیکنان و فایل آزمون مدل Lobby نیز موفق بودند. برای Typecheck واقعی، Vite Production Build و تست‌های کامل باید وابستگی‌های محلی نصب شوند. نصب وابستگی‌ها در این محیط به timeout برخورد کرد؛ تلاش Typecheck نیز به‌دلیل نبود `@types/node` و `vite/client` متوقف شد؛ بنابراین `vite build` و تست بصری مرورگر در این محیط تأیید نشده‌اند.

تست parity تاریخی Maze نیز به `legacy/mazeV3` نیاز دارد که در ZIP ورودی موجود نیست. نبود این baseline را نباید با ادعای parity کامل جایگزین کرد.
