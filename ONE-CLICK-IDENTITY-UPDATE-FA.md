# به‌روزرسانی یک‌کلیکی Wallet و Identity در Maze

## هدف تغییر

هدف این تغییر حذف اقدام جداگانهٔ `Sign in to Maze` از تجربهٔ کاربری است. از این پس کاربر فقط دکمهٔ اصلی هدر را می‌زند؛ اگر کیف‌پول متصل نباشد، AppKit باز می‌شود و بعد از اتصال موفق، Maze به‌صورت خودکار احراز هویت را آغاز می‌کند. اگر کیف‌پول از قبل متصل اما حساب Maze ناشناس باشد، همان دکمه مستقیماً ورود را آغاز می‌کند.

## تغییرات Frontend

- `WalletConnectButton.tsx`
  - یک intent مشخص برای ادامهٔ Login پس از Connect نگهداری می‌شود.
  - بعد از اینکه AppKit اتصال و قابلیت امضای کیف‌پول را گزارش کرد، `performLogin()` خودکار اجرا می‌شود.
  - اگر Wallet از قبل متصل و Identity ناشناس باشد، کلیک اصلی مستقیماً ورود را اجرا می‌کند و منوی واسط نمایش داده نمی‌شود.
  - دکمهٔ جداگانهٔ `Sign in to Maze` از منوی کیف‌پول حذف شده است.
  - قفل درخواست مانع ارسال چند درخواست امضا به‌صورت هم‌زمان می‌شود؛ کنترل `disabled` نیز در زمان اتصال/امضا از کلیک تکراری جلوگیری می‌کند.
  - در نسخه اولیه این گزارش، گزینه‌های Wallet و Disconnect مستقل بودند؛ اصلاح بعدی در `UNIFIED-SESSION-TEARDOWN-FA.md` این رفتار را با یک اقدام واحد پایان نشست جایگزین کرده است.
- `WalletConnectRuntime.tsx`
  - Bridge محدود و lazy-loaded برای `solana:signIn` (در صورت ارائه توسط provider) و `signMessage` نگه داشته شده است.
  - اگر provider فقط `signMessage` ارائه کند، مسیر سازگار فعلی اجرا می‌شود.
- `IdentityProvider.tsx`
  - در صورت وجود `signIn`، خروجی حساب، نوع امضا، بایت‌های دقیق پیام و Signature بررسی می‌شود.
  - در غیر این صورت امضای پیام SIWS از مسیر فعلی استفاده می‌شود.
  - فقط پس از تأیید Backend، Session فعال و مسیر `/profile` باز می‌شود.
- `identity-client.ts`
  - فیلدهای proof استاندارد Wallet را با درخواست Verify ارسال می‌کند.

## تغییرات Backend و تست

- Challenge به‌صورت SIWS شامل Domain، Address، Nonce، زمان صدور، انقضا و `solana:mainnet` ساخته می‌شود.
- در مسیر proof استاندارد، آدرس و بایت‌های پیام ارسالی باید دقیقاً با Challenge ذخیره‌شده در سرور تطبیق داشته باشند؛ متن دلخواه کلاینت پذیرفته نمی‌شود.
- امضای ۶۴‌بایتی Ed25519 همچنان در سرور بررسی و Nonce به‌صورت اتمیک مصرف می‌شود.
- تست Identity گسترش یافته تا ورودی SIWS، پیام دست‌کاری‌شده، آدرس ناهماهنگ و replay proof را بررسی کند.
- `scripts/check-layout.mjs` اکنون وجود مسیر auto-login و نبودن اقدام جداگانهٔ sign-in در منوی اصلی را کنترل می‌کند.

## نکتهٔ مهم دربارهٔ «یک امضا»

مجوز اتصال کیف‌پول و امضای ورود یک مفهوم نیستند:

1. **Connect approval** به برنامه اجازه می‌دهد حساب عمومی کیف‌پول را از اتصال AppKit دریافت کند؛ این یک تراکنش بلاک‌چین یا امضای اثبات مالکیت نیست.
2. **SIWS message signature** مالکیت کیف‌پول را برای ایجاد Session در Maze اثبات می‌کند؛ این یک امضای خارج از زنجیره است و تراکنش یا کارمزد شبکه ندارد.

در نتیجه، این Patch تجربهٔ سایت را به یک کلیک تبدیل می‌کند و Maze فقط یک امضای رمزنگاری‌شده برای Login درخواست می‌کند. با مسیر متداول Reown AppKit ممکن است کیف‌پول ابتدا مجوز Connect و سپس امضای پیام ورود را جداگانه از کاربر تأیید بگیرد.

استاندارد Wallet Standard `solana:signIn` می‌تواند در کیف‌پول‌های سازگار، اتصال و امضای ورود را در یک فراخوانی انجام دهد. اما در ساختار فعلی Maze، `useAppKitProvider('solana')` فقط پس از اتصال provider را در اختیار Bridge قرار می‌دهد؛ بنابراین کد حاضر ادعا نمی‌کند که در اولین اتصال، این دو approval در همهٔ کیف‌پول‌ها در یک درخواست واحد ادغام شده‌اند. پشتیبانی اختیاری `signIn` برای providerهایی که آن را ارائه می‌دهند حفظ شده، اما در Reown provider متداول fallback به `signMessage` استفاده می‌شود.

برای ادغام واقعی قبل از اتصال، باید مستقیماً Wallet Standard registry و قابلیت `solana:signIn` را به‌عنوان مسیر ورود اولیه پیاده کرد (و برای کیف‌پول‌های remote/WalletConnect مسیر AppKit را نگه داشت). آن تغییر مستلزم انتخاب و هماهنگ‌سازی connector و account state با AppKit است؛ انجام حدسی آن می‌تواند وضعیت اتصال Wallet در AppKit را از وضعیت Identity جدا کند، بنابراین در این Patch اعمال نشده است.

## اعتبارسنجی انجام‌شده

موفق:

- `node --check shared/identity/identity-routes.js`
- `node --check tests/identity/identity-routes.test.cjs`
- `node --check scripts/check-layout.mjs`
- `npm run check:layout`
- `npm run check:css:duplicates`
- TypeScript `transpileModule` syntax check برای فایل‌های TS/TSX تغییرکرده
- `git diff --check`

اجرا نشد:

- `npm run test:identity` به‌علت نصب‌نبودن `better-sqlite3` در محیط فعلی متوقف شد (`MODULE_NOT_FOUND`).
- Typecheck کامل، Production Build و تست Wallet واقعی/مرورگر در این محیط اجرا نشدند؛ وابستگی‌های پروژه نصب نیستند. تست syntax به معنی Typecheck یا Build موفق نیست.

## فایل‌های اصلی تغییرکرده

- `src/platform/wallet/WalletConnectButton.tsx`
- `src/platform/wallet/WalletConnectRuntime.tsx`
- `src/platform/identity/IdentityProvider.tsx`
- `src/platform/identity/identity-client.ts`
- `src/platform/identity/identity-types.ts`
- `shared/identity/identity-routes.js`
- `tests/identity/identity-routes.test.cjs`
- `scripts/check-layout.mjs`
- راهنماهای Wallet و Identity و CSSهای دکمهٔ گزینه‌های کیف‌پول
