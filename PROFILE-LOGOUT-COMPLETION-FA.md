# تکمیل رابط خروج از حساب — MAZE 6.54

## مشکل

منطق Logout و قطع کیف پول از قبل در `WalletConnectButton` و `wallet-session-teardown.ts` وجود داشت، اما خود `WalletConnectButton` فقط در وضعیت `anonymous` در `ProfilePage` رندر می‌شد. بنابراین پس از ورود، منوی حسابی که گزینهٔ خروج را در خود داشت از درخت React حذف می‌شد و کاربر به آن دسترسی نداشت.

## اصلاح

- یک نمونهٔ واحد از `WalletConnectButton` در پنل حساب Profile قرار گرفت.
- این پنل در وضعیت‌های `anonymous`، `authenticating` و `authenticated` نمایش داده می‌شود؛ بنابراین کامپوننت هنگام ورود و خروج Unmount/Remount نمی‌شود.
- در وضعیت ناشناس، همان دکمهٔ اصلی `Connect Wallet` نمایش داده می‌شود.
- در وضعیت ورود موفق، دکمه به یک Account Menu فشرده تبدیل می‌شود.
- منوی حساب گزینه‌های Profile، Wallet و عملیات واحد خروج/قطع اتصال را ارائه می‌کند.
- برای خروج، همان `runWalletSessionTeardown` قبلی حفظ شده است: ابتدا نشست سمت سرور باطل می‌شود و سپس در صورت اتصال، کیف پول قطع می‌شود.
- اگر ابطال نشست شکست بخورد، کیف پول متصل باقی می‌ماند. اگر نشست با موفقیت بسته شود ولی قطع کیف پول شکست بخورد، وضعیت بازیابی قطع اتصال باقی می‌ماند.
- منو با کلیک بیرون بسته می‌شود؛ Escape آن را می‌بندد و Focus را به دکمهٔ بازکننده برمی‌گرداند. ArrowUp/ArrowDown/Home/End نیز برای پیمایش گزینه‌ها پشتیبانی می‌شوند.
- مستندات Identity و Wallet و آزمون Layout با محل جدید Account Menu هماهنگ شدند.

## فایل‌های تغییرکرده

- `src/features/profile/ProfilePage.tsx`
- `src/features/profile/profile-page.css`
- `src/platform/wallet/WalletConnectButton.tsx`
- `src/platform/wallet/README.md`
- `src/platform/identity/README.md`
- `scripts/check-layout.mjs`

## آزمون‌ها

- `npm run check:layout` — موفق
- `npm run check:css:duplicates` — موفق، ۱۹ فایل CSS فعال
- `npm run check:svg-theme` — موفق؛ سه هشدار مربوط به فایل‌های پس‌زمینهٔ قدیمی و از قبل مفقود Maze باقی است
- TypeScript transpile برای دو فایل TSX تغییرکرده — موفق از نظر Syntax
- تست دستی تابع teardown — ترتیب Logout قبل از Disconnect و جلوگیری از Disconnect در صورت شکست Logout تأیید شد
- `tsc --noEmit --project tsconfig.json` — قابل تکمیل نبود؛ `@types/node` و `vite/client` در `node_modules` موجود نیستند
- Vite Build و تست مرورگر/کیف پول واقعی — اجرا نشده‌اند

## محدودهٔ تغییر

هیچ Route، API، پروتکل SIWS، Cookie، Identity Store، Reown runtime، Game Loop، Simulation یا WebSocket تغییر نکرده است.
