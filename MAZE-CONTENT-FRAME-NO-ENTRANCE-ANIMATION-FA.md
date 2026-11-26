# اصلاح ورود مجدد قاب محتوای Maze

## علت
عنصر `#createGame.cg` قاب محتوای مشترک Viewهای Create، Rooms و Live است. کلاس `show` در زمان نمایش به آن اضافه می‌شود و دو تعریف CSS برای `.cg.show` آن را با `cgFade` از شفافیت صفر ظاهر می‌کردند؛ یکی در `maze-site.css` و دیگری در `create-game.css`.

## اصلاح
- تعریف Legacy تکراری `.maze-app .cg.show` از `maze-site.css` حذف شد.
- در `create-game.css` فقط `display: flex` برای `.cg.show` باقی ماند؛ انیمیشن قاب حذف شد.
- Keyframes بلااستفادهٔ `cgFade` حذف شد.
- انیمیشن‌های داخلی کنترل‌ها، مراحل Wizard، Live، Rooms، کارت‌ها، Toastها و Gameplay دست‌نخورده ماندند.
- کنترل رگرسیون به `scripts/check-layout.mjs` اضافه شد تا انیمیشن ورود مجدد قاب مشترک بازنگردد.

## دامنه
فقط انیمیشن ورودی قاب `#createGame` تغییر کرده است. هندسهٔ قاب، اسکرول، Header، Navigation، Game Loop، Simulation، Room Store و WebSocket تغییر نکرده‌اند.
