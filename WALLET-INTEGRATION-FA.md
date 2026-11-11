# پیاده‌سازی اتصال کیف پول سولانا در Maze

این Patch لایه اتصال کیف پول را به ساختار فعلی Vite + React اضافه می‌کند و منطق بازی، Game Loop، WebSocket، Room Store، APIهای فعلی و Backend موجود را تغییر نمی‌دهد.

## انتخاب معماری

- Reown AppKit + Solana Adapter برای اتصال کیف پول‌ها و مسیر WalletConnect / QR.
- حفظ `@solana/web3.js@1.99.0` و `@solana/spl-token@0.4.15` فعلی؛ هیچ مهاجرت SDK یا بازنویسی کدهای موجود انجام نشده است.
- اتصال از همان دکمه `Connect Wallet` موجود در `SiteNavigation` انجام می‌شود.
- تم AppKit از `ThemeBridgeProvider` و تم‌های موجود Maze پیروی می‌کند.
- شبکه فعال در این مرحله Solana Mainnet است.
- آدرس کیف پول پس از اتصال در دکمه Navigation نمایش داده می‌شود.

## فایل‌های تغییر یافته

- `package.json`
- `.env.example`
- `src/components/navigation/SiteNavigation.tsx`
- `src/styles/style.css`
- `src/platform/wallet/appkit.ts` (جدید)
- `src/platform/wallet/WalletConnectButton.tsx` (جدید)
- `src/platform/wallet/README.md`
- `src/platform/identity/README.md`

## راه‌اندازی

1. فایل‌های Patch را در ریشه پروژه استخراج و فایل‌ها را جایگزین کن.
2. در PowerShell:

   ```powershell
   npm install
   ```

   این فرمان `package-lock.json` را با وابستگی‌های جدید هماهنگ می‌کند.
3. از [Reown Dashboard](https://dashboard.reown.com) یک Project ID بساز.
4. در `.env` (و در متغیرهای محیطی مرحله Build روی سرور) قرار بده:

   ```dotenv
   VITE_REOWN_PROJECT_ID=YOUR_PUBLIC_PROJECT_ID
   VITE_APP_URL=https://hollld.fun
   ```

5. دامنه دقیق سایت را در تنظیمات Reown مجاز کن.
6. اعتبارسنجی:

   ```powershell
   npm run check:layout
   npm run typecheck
   npm run build:all
   npm run test:all
   ```

## مرزهای مهم

این مرحله فقط اتصال کیف پول است؛ هنوز SIWS، ورود به حساب، ساخت Session، امضای پیام یا تراکنش فعال نشده است. بنابراین هیچ کیف پولی صرفاً با اتصال، کاربر احراز هویت‌شده Maze محسوب نمی‌شود.

پشتیبانی «تمام کیف پول‌ها» قابل تضمین نیست؛ این ترکیب پوشش گسترده Wallet Standard و WalletConnect را فراهم می‌کند. اگر تست واقعی موبایل نشان دهد کیف پول Android خاصی فقط از MWA پشتیبانی می‌کند، MWA باید به‌عنوان transport مکمل در `src/platform/wallet` اضافه شود.
