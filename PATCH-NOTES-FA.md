# تغییرات منوی کیف پول — Maze

مبنای تغییر: `online maze cleaned.zip` ارسالی کاربر در 2026-11-18.

## فایل‌های داخل بسته

- `src/platform/wallet/WalletConnectButton.tsx`
- `src/platform/wallet/WalletConnectRuntime.tsx`
- `src/styles/arena.css`

## رفتار جدید

1. گزینه `Disconnect` به منوی Profile / Wallet افزوده شد.
2. عملیات قطع اتصال از hook رسمی `useDisconnect` در Reown AppKit استفاده می‌کند و فقط namespace مربوط به `solana` را قطع می‌کند؛ سایر namespaceهای احتمالی تحت تأثیر قرار نمی‌گیرند.
3. هنگام انجام عملیات، گزینه Disconnect غیرفعال و متن آن `Disconnecting…` می‌شود.
4. در صورت خطا، پیام خطا در همان منو نمایش داده می‌شود و امکان تلاش مجدد وجود دارد.
5. پس از دریافت snapshot قطع اتصال از AppKit، منو بسته و state موقت پاک می‌شود.
6. منوی بیرونی و هر سه گزینه Profile / Wallet / Disconnect با متغیرهای تم فعال، پس‌زمینه، حاشیه و گوشه‌های برش‌خورده شبیه کنترل‌های Theme و Game View طراحی شدند.
7. گروه آیکون و متن هر دکمه به‌صورت افقی در مرکز قرار می‌گیرد.

## موارد حفظ‌شده

- جریان اولیه Connect و بارگذاری تنبل Wallet Runtime.
- باز کردن صفحه Account در Reown با انتخاب Wallet.
- تنظیمات AppKit و فایل `appkit.ts`.
- وضعیت اتصال از `useAppKitAccount`؛ هیچ پاک‌سازی دستی localStorage یا session انجام نمی‌شود.
- سایر بخش‌های Maze، بازی، API، WebSocket و Room Store تغییری نکرده‌اند.

## اعتبارسنجی انجام‌شده

- `npm run check:layout`: موفق.
- `npm run check:css:duplicates`: موفق؛ 18 فایل CSS فعال، بدون تکرارهای گزارش‌شده.
- TypeScript `transpileModule` برای دو فایل TSX تغییر‌یافته: موفق.
- PostCSS parse برای `arena.css`: موفق.
- `npm run typecheck`: در این محیط به علت نصب نبودن تعریف‌های `@types/node` و `vite/client` اجرا نشد.
- Build و آزمون واقعی اتصال/قطع اتصال در مرورگر انجام نشده؛ برای آن به نصب وابستگی‌ها و اتصال یک کیف پول نیاز است.

برای اعمال، محتویات ZIP را در ریشه پروژه استخراج و سه فایل را جایگزین کنید.
