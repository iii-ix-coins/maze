# یکپارچه‌سازی Logout و Disconnect در Maze

## هدف

حذف دو گزینه مستقل `Logout` و `Disconnect wallet` از منوی کاربر، و ارائه یک اقدام روشن برای پایان دادن به حساب Maze و اتصال کیف‌پول.

## رفتار منو

| وضعیت فعلی | اقدام نمایش‌داده‌شده | نتیجه |
|---|---|---|
| حساب واردشده + کیف‌پول متصل | `Disconnect & log out` | ابتدا Session سمت سرور باطل، سپس اتصال Solana قطع می‌شود |
| حساب مهمان + کیف‌پول متصل | `Disconnect wallet` | فقط اتصال کیف‌پول قطع می‌شود |
| حساب واردشده + کیف‌پول قطع | `Log out` | فقط Session سمت سرور باطل می‌شود |
| حساب مهمان + کیف‌پول قطع | منوی حساب نمایش داده نمی‌شود | هیچ اقدامی لازم نیست |

## ترتیب امن عملیات

1. در حالت حساب واردشده، ابتدا `POST /api/auth/logout` اجرا می‌شود.
2. اگر Logout سمت سرور شکست بخورد، کیف‌پول قطع نمی‌شود و کاربر می‌تواند همان عملیات را دوباره امتحان کند.
3. پس از ابطال موفق Session، اتصال Solana از طریق `useDisconnect` رسمی Reown قطع می‌شود.
4. اگر قطع اتصال شکست بخورد، Session همچنان باطل می‌ماند و رابط کاربری فقط اقدام باقی‌مانده `Disconnect wallet` را ارائه می‌کند؛ نیازی به اجرای مجدد Logout نیست.
5. عملیات در helper مستقل `wallet-session-teardown.ts` قرار گرفته و برای ترتیب اجرا، خطای Logout، خطای Disconnect، وضعیت‌های نیمه‌کامل و قطع شدن کیف حین درخواست تست واحد دارد.

## همگام‌سازی با اقدامات خارج از منوی Maze

- قطع اتصال پایدار از داخل modal خود Reown یا از خود کیف‌پول، Session Maze را نیز باطل می‌کند.
- تغییر حساب فعال Solana هنگام authenticated بودن، Session کیف‌پول قبلی را می‌بندد. کیف‌پول جدید باید با اقدام صریح کاربر وارد Maze شود.
- وضعیت‌های موقت `connecting` و `reconnecting` باعث Logout نمی‌شوند.
- در بارگذاری اولیه، صرفاً متصل نبودن کیف‌پول پیش از بازیابی AppKit به معنی Disconnect عمدی محسوب نمی‌شود؛ بنابراین Session معتبر سرور می‌تواند بازیابی شود.
- اگر کیف‌پول حین امضای Login قطع یا عوض شود، callback اتصال در Identity دوباره بررسی می‌شود. اگر تأیید سرور هم‌زمان با تغییر اتصال تکمیل شده باشد، Session تازه ایجادشده فوراً برای ابطال به سرور برگردانده می‌شود و ورود پذیرفته نمی‌شود.

## هزینه و عملکرد

- سرویس پس‌زمینه، polling، timer دائمی یا درخواست دوره‌ای تازه اضافه نشده است.
- همگام‌سازی فقط با تغییر snapshot اتصال AppKit اجرا می‌شود.
- عملیات پایان نشست فقط با اقدام کاربر یا رویداد واقعی قطع/تعویض کیف‌پول انجام می‌شود.
- Game Loop، Simulation، WebSocket protocol، Room Store و APIهای بازی تغییر نکرده‌اند.

## فایل‌های تغییرکرده

- `src/platform/wallet/WalletConnectButton.tsx`
- `src/platform/wallet/wallet-session-teardown.ts` (جدید)
- `src/platform/wallet/wallet-session-teardown.test.ts` (جدید)
- `src/platform/identity/IdentityProvider.tsx`
- `src/platform/identity/identity-types.ts`
- `src/platform/identity/README.md`
- `src/platform/wallet/README.md`
- `src/styles/arena.css`
- `scripts/check-layout.mjs`

## اعتبارسنجی

تست واحد helper با Vitest اضافه شده است. علاوه بر آن، هفت سناریوی اصلی helper با اجرای مستقیم Runtime در محیط فعلی بررسی و همگی موفق شدند. کنترل ساختار React و CSS و Syntax فایل‌های تغییرکرده نیز موفق است. در این محیط `node_modules` نصب نیست؛ بنابراین اجرای خود Vitest، Typecheck کامل و Production Build باید پس از `npm ci` انجام شود. این بررسی‌ها جایگزین تست واقعی با Phantom، Solflare و WalletConnect نیستند.
