# فاز ۱ — یکپارچگی وضعیت ورود در لحظهٔ اول (Identity Bootstrap)

## مشکل
در هر «سند جدید» (ورود به `/maze.html` یا `/play`، یا خروج از آن) React از صفر بالا می‌آمد،
`IdentityProvider` با وضعیت `checking` شروع می‌کرد و تا پایان درخواست `/api/auth/session`
Gate مهمان نمایش داده می‌شد. کاربر واردشده برای چند صد میلی‌ثانیه صفحهٔ «خروج‌کرده» را می‌دید.

## راه‌حل
1. **سرور** هنگام ارسال HTML، کوکی نشست را می‌خواند و Snapshot عمومی کاربر را (همان داده‌ای که
   `/api/auth/session` به همان صاحب کوکی می‌دهد) داخل `<script id="identity-bootstrap" type="application/json">` قرار می‌دهد.
   - `shared/identity/identity-bootstrap.js` (خالص و تست‌پذیر؛ خروجی JSON امن برای inline: escape برای `< > & U+2028/9`، و جایگزینی با تابع تا `$&` تفسیر نشود)
   - `server.js` → `sendSiteDocument()` برای `/`, `/explore`, `/maze`, `/profile`, `/maze.html`, `/play`
   - هدرها: `Cache-Control: no-store` و `Vary: Cookie` (HTML وابسته به کاربر است)
   - هر خطا → بازگشت به HTML ساده؛ کلاینت مثل قبل از API نشست را می‌خواند (fail-safe)
2. **کلاینت** Snapshot را همزمان و پیش از اولین Render می‌خواند (`identity-bootstrap.ts`).
   `IdentityProvider` از همان لحظه `authenticated` یا `anonymous` است؛ هرگز `checking` نیست.
   اعتبارسنجی پس‌زمینه ادامه دارد: اگر نتیجه یکسان باشد هیچ State/Transition/Re-render رخ نمی‌دهد،
   اگر متفاوت باشد (نشست ابطال‌شده) همان مسیر قبلی اجرا می‌شود. خطای شبکهٔ اعتبارسنجی، نشستِ تأییدشدهٔ سرور را خراب نمی‌کند.
3. **Loader** (`PageLoadingProvider`) برای همهٔ صفحات (نه فقط Maze) تا مشخص‌شدن وضعیت هویت باقی می‌ماند
   (سقف ۸ ثانیه)، و برای کاربر واردشده Chunk صفحهٔ مقصد را پیش از برداشتن Loader آماده می‌کند تا
   قاب خالی Suspense دیده نشود. مسیر بدون Snapshot (Vite dev) نیز دیگر Gate مهمان را فلش نمی‌کند.

## بدون تغییر
منطق Login/Logout، SIWS، Gate، Engine، Canvas، WebSocket، Room Store، APIها و هندسهٔ قاب‌ها.

## تست
- `node --test tests/identity/identity-bootstrap.test.cjs` — اجرا و موفق (۳ تست)
- `src/platform/identity/identity-bootstrap.test.ts` (Vitest) — منطق با tsx اجرا و موفق؛ خود Vitest اجرا نشد (node_modules موجود نیست)
- `node scripts/check-layout.mjs` — موفق (قرارداد جدید Bootstrap اضافه شد)
- Syntax TypeScript فایل‌های تغییرکرده — موفق

## اجرا نشده (نیاز به محیط واقعی)
`npm ci`، `npm run typecheck`، `npm run build:all`، و تست بصری مرورگر. شبکه و node_modules در این محیط نبود.
