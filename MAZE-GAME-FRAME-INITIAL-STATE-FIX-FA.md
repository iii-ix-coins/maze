# اصلاح ریشه‌ای ورود مجدد قاب محتوای صفحات بازی

## علت واقعی

در `index.html` مسیرهای `/maze.html` و `/play` پیش از Mount شدن React، کلاس `in-menu` را به `body` اضافه می‌کنند تا قاب محتوای بازی از اولین استایل‌دهی مرورگر هندسهٔ مشترک سایت را داشته باشد.

اما در `MazeMenu.tsx` یک Effect وابسته به `state.visible` وجود داشت که هم‌زمان:

1. کلاس `in-menu` را مطابق وضعیت React تغییر می‌داد.
2. در Cleanup همان Effect، کلاس `in-menu` را حذف می‌کرد.

Cleanup فقط هنگام Unmount اجرا نمی‌شود؛ با هر تغییر `state.visible` نیز پیش از اجرای Effect بعدی اجرا می‌شود. بنابراین در شروع Create/Rooms/Live، کلاس اولیهٔ سند حذف و دوباره اضافه می‌شد. Selectorهای قاب در `site.css` بین این دو لحظه از `body.in-menu` به حالت عادی و برعکس تغییر می‌کردند؛ قاب ظاهراً دوباره وارد می‌شد. حذف `cgFade` این چرخهٔ وضعیت را حل نمی‌کرد.

## اصلاح

- `MazeMenu` اکنون همگام‌سازی `body.in-menu` را تا رویداد `maze:engine-ready` به تعویق می‌اندازد.
- `engine/boot.ts` پس از انتخاب وضعیت اولیهٔ بازی (`restoreGame()` یا `showMenu()`) ویژگی `data-maze-engine-ready` را روی `documentElement` ثبت و رویداد `maze:engine-ready` را منتشر می‌کند.
- Effect مربوط به `state.visible` فقط وضعیت را همگام می‌کند و Cleanup ندارد.
- حذف `body.in-menu` به Effect مستقلِ بدون Dependency منتقل شده؛ بنابراین فقط هنگام Unmount واقعی `MazeMenu` اجرا می‌شود.
- اگر Engine پیش از نصب Listener آماده شده باشد، مقدار `data-maze-engine-ready` همان وضعیت را بازیابی می‌کند.

## رفتار مورد انتظار

- در مسیرهای Create، Rooms و Live، کلاس اولیهٔ `in-menu` در طول راه‌اندازی حفظ می‌شود.
- قاب مرکزی دیگر به‌دلیل حذف/افزودن موقت کلاس، از هندسهٔ منو خارج و دوباره وارد نمی‌شود.
- پس از آماده‌شدن موتور، وضعیت واقعی منو تعیین می‌کند که سند در حالت منو باشد یا Gameplay.
- هنگام بازگشت واقعی از Gameplay به منو، تغییر حالت همچنان انجام می‌شود.

## فایل‌های تغییرکرده

- `src/features/maze/ui/react/MazeMenu.tsx`
- `src/features/maze/engine/boot.ts`
- `scripts/check-layout.mjs`
- `src/features/maze/README.md`

## محدودهٔ محافظت‌شده

هیچ تغییری در Game Loop، Simulation، الگوریتم تولید Maze، Canvas، WebSocket، Room Store، داده‌ها یا پروتکل Multiplayer انجام نشده است. انیمیشن‌های داخلی Create، Rooms، Live و کنترل‌های بازی نیز دست‌نخورده‌اند.

## آزمون‌ها

- Layout validation: موفق
- CSS duplicate check: موفق (۱۹ فایل فعال)
- SVG theme contract: موفق
- TypeScript transpile syntax برای دو فایل تغییرکرده: موفق
- تست مرورگر واقعی، Typecheck کامل و Production Build: در این محیط اجرا نشده‌اند.
