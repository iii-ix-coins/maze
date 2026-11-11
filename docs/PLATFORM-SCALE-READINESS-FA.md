# نقشه ارتقای مهندسی Maze برای مقیاس بسیار بزرگ

> وضعیت این سند: نقشه معماری و ارزیابی صادقانه ظرفیت؛ نه ادعای آمادگی تولید برای یک میلیارد اتصال هم‌زمان.

## 1. محدوده و تضمین‌های مهاجرت

این ارتقا نباید قراردادهای فعلی API، پروتکل WebSocket نسخه 2، الگوریتم‌های Maze، Game Loop، Simulation، Room Store یا رفتار و ظاهر رابط کاربری را تغییر دهد. هر مهاجرت Backend باید با Adapter و نسخه‌بندی قرارداد انجام شود و تا زمان داشتن تست سازگاری، جایگزین مسیر موجود نشود.

## 2. ارزیابی وضع موجود در نسخه تحویلی

- Frontend یک React root دارد و Vite خروجی fingerprinted تولید می‌کند.
- MazeBackground در App ریشه‌ای است؛ تصویرها از SVGهای public بارگذاری می‌شوند.
- Express وب و APIها در یک Node process اجرا می‌شود.
- Maze WebSocket state در حافظه همان process نگهداری می‌شود: `clients`, `rooms`, `roomsByCode`, `lobbyWatchers` و `peekRooms` در `engines/maze-server/src/state.ts`.
- تنظیمات Maze در حال حاضر `MAX_CONNECTIONS=2000`، `MAX_CONNECTIONS_PER_IP=100` و `MAX_ROOMS=400` را پیش‌فرض می‌گیرند.
- چند engine و state service از SQLite / فایل JSON و state محلی process استفاده می‌کنند.
- در نتیجه اجرای چند replica از Maze server بدون انتقال مالکیت Room، registry توزیع‌شده و pub/sub مشترک، باعث split-brain و ناهماهنگی اتاق‌ها می‌شود.
- Wallet SDKهای Solana در dependencyها وجود دارند، اما این به معنی وجود جریان امن اتصال کیف پول، احراز هویت، session یا حساب کاربری نیست.

## 3. تعریف صحیح هدف مقیاس

«یک میلیارد کاربر ثبت‌نام‌شده»، «یک میلیارد کاربر فعال ماهانه»، «یک میلیارد درخواست روزانه» و «یک میلیارد اتصال هم‌زمان» چهار مسئله متفاوت‌اند. هدف ظرفیت باید برای هر کدام جداگانه تعریف شود: کاربران ثبت‌نامی، DAU/MAU، نرخ درخواست در ثانیه، اتصالات هم‌زمان، پیام WebSocket در ثانیه، اندازه payload، latency هدف، منطقه جغرافیایی، RPO/RTO و بودجه.

هیچ تغییر Frontend به‌تنهایی نمی‌تواند ظرفیت یک میلیارد اتصال هم‌زمان را ایجاد یا تضمین کند. برای چنین هدفی به طراحی توزیع‌شده، آزمون بار در مقیاس، ظرفیت شبکه و قراردادهای زیرساختی ارائه‌دهنده Cloud نیاز است.

## 4. معماری هدف

### Edge و Frontend

- توزیع فایل‌های Vite از CDN با immutable caching برای assetهای hash شده و cache کوتاه/بدون cache برای HTML.
- WAF و DDoS protection در Edge؛ TLS اجباری و security headers در gateway.
- React application stateless؛ عدم نگهداری session حساس یا کلید خصوصی در localStorage.
- API client دارای timeout، cancellation، محدودیت concurrency، backoff و telemetry؛ polling موجود فقط پس از ثبت baseline و تست تغییر می‌کند.

### API و هویت

- API Gateway / BFF stateless در چند منطقه، با rate limit و quota بر اساس IP، account و wallet.
- سرویس Identity جدا از UI: ثبت‌نام، ورود، session، recovery، مدیریت دستگاه و audit trail.
- Session با cookieهای `HttpOnly`, `Secure`, `SameSite` یا توکن کوتاه‌عمر با rotation؛ محافظت CSRF برای cookie session.
- رمزها فقط با الگوریتم password hashing استاندارد و پارامترهای قابل ارتقا ذخیره شوند؛ هرگز plaintext یا encryption قابل برگشت.
- nonce یک‌بارمصرف، انقضا، domain/origin binding و جلوگیری از replay برای امضای کیف پول.
- امضای کیف پول فقط اثبات کنترل آدرس است؛ به‌تنهایی نباید مجوز برداشت، دسترسی حساب یا مالکیت دارایی خارج از scope امضا تلقی شود.

### Data و Eventing

- PostgreSQL مدیریت‌شده به‌عنوان منبع حقیقت داده‌های حساب، نشست، تراکنش و مالکیت؛ migrationهای نسخه‌بندی‌شده و backup/PITR.
- Redis یا معادل مدیریت‌شده برای cache، rate-limit، nonce/session و هماهنگی کوتاه‌عمر؛ نه منبع حقیقت مالی.
- Event bus مانند Kafka/Redpanda/Pulsar برای رویدادهای قابل replay، با idempotency key، schema registry، retry و dead-letter queue.
- Object storage برای داده‌های حجیم و archive؛ partitioning و retention براساس دسترسی و قانون.
- SQLite و JSON محلی فقط برای توسعه، ابزارهای تک‌نمونه یا workloadهای محدود باقی بمانند؛ برای چند replica و داده حیاتی منبع حقیقت توزیع‌شده نیستند.

### Maze real-time

- هر Room یک owner/shard مشخص داشته باشد؛ همه پیام‌های مربوط به آن Room به همان owner route شوند.
- Registry توزیع‌شده و lease/fencing token برای جلوگیری از دو owner هم‌زمان.
- Gatewayهای WebSocket منطقه‌ای با connection directory و pub/sub بین shardها.
- انتقال Room بین shardها فقط با پروتکل migration و snapshot/version؛ در غیر این صورت Room state در process محلی باقی می‌ماند.
- Game Loop همچنان خارج از React باقی می‌ماند. این سند هیچ تغییری در الگوریتم یا نرخ tick بازی پیشنهاد نمی‌کند.

### Observability و عملیات

- OpenTelemetry برای trace، metric و log؛ correlation/request ID از Edge تا سرویس.
- SLO جدا برای API، login/wallet challenge، WebSocket connect، room join و message delivery.
- readiness و liveness مجزا؛ readiness وابستگی‌های ضروری را می‌سنجد و liveness فقط زنده بودن process را.
- deployment با canary/rolling، graceful drain اتصالات، rollback، secret manager و مدیریت کلیدها.
- load test مرحله‌ای، chaos test، تست failover منطقه‌ای و تمرین بازیابی backup پیش از افزایش ظرفیت.

## 5. قراردادهای Wallet و Account

### Wallet connection

1. کلاینت درخواست challenge می‌کند.
2. سرور nonce تصادفی، کوتاه‌عمر و یک‌بارمصرف صادر می‌کند.
3. متن امضا شامل domain، URI، chain/network، wallet address، nonce، issued-at و expiration باشد.
4. سرور امضا را با کلید عمومی/آدرس ادعاشده verify می‌کند و nonce را اتمیک مصرف می‌کند.
5. سرور session ایجاد می‌کند؛ آدرس کیف پول به‌عنوان شناسه هویت ثبت می‌شود، نه secret.
6. تغییر wallet، unlink، چند کیف پول و account recovery باید policy صریح داشته باشند.

هیچ seed phrase، private key یا secret wallet نباید به سرور ارسال یا در مرورگر ذخیره شود.

### Account

- User ID داخلی مستقل از wallet address.
- Wallet identity به‌صورت رابطه یک‌به‌چند با verification metadata.
- Unique constraints و transactionهای اتمیک برای جلوگیری از اتصال هم‌زمان یک wallet به چند حساب.
- Audit events برای login، link/unlink، تغییر امنیتی و عملیات حساس.
- دسترسی بر اساس least privilege و authorization سمت سرور؛ مخفی کردن دکمه در React کنترل دسترسی نیست.

## 6. فازبندی مهاجرت کم‌ریسک

1. **Baseline و invariants:** snapshot قراردادهای API/WS، تست‌های golden و benchmark رفتار فعلی.
2. **Frontend platform:** readiness coordination، error boundaries، telemetry و typed API boundary؛ بدون تغییر payload یا cadence.
3. **Identity foundation:** قراردادها، threat model، nonce/session service و تست امنیتی؛ اتصال UI فقط پس از آماده بودن Backend.
4. **Data foundation:** PostgreSQL، migrations، cache و event bus؛ مهاجرت تدریجی با dual-read/compare و سپس cutover کنترل‌شده.
5. **Realtime sharding:** room ownership، shared registry/pub-sub، reconnect و migration protocol؛ حفظ protocol v2 در لایه adapter.
6. **Scale validation:** آزمون بار با سناریوهای واقعی و ظرفیت‌سنجی هزینه‌ای؛ افزایش replica فقط پس از اثبات consistency.

## 7. معیارهای پذیرش

- ظاهر و screenshotهای صفحات قبل/بعد یکسان باشند.
- تست‌های فعلی API و Maze protocol بدون تغییر پاس شوند.
- Game Loop و simulation diff رفتاری نداشته باشند.
- هیچ secret یا private key در client bundle، log یا storage قرار نگیرد.
- تست nonce replay، expiration، origin mismatch، signature invalid، session rotation و CSRF پاس شود.
- چند replica بتوانند Room را با consistency تضمین‌شده مدیریت کنند، قبل از فعال شدن horizontal scale.
- SLO، load test، failover و disaster recovery با اعداد هدف‌گذاری‌شده و گزارش قابل تکرار ارائه شوند.

## 8. خارج از محدوده این تغییر ZIP

ایجاد واقعی زیرساخت Cloud، CDN/WAF، managed PostgreSQL، Redis، Kafka، KMS/HSM، providerهای RPC، حساب‌های production، domain، secretها و قراردادهای مالی از داخل سورس ZIP ممکن نیست. همچنین اتصال واقعی Wallet و ساخت حساب کاربری نیازمند طراحی و پیاده‌سازی Backend امن و تصمیم‌های محصولی است. این موارد نباید با mock یا کد نمایشی به‌عنوان قابلیت production معرفی شوند.
