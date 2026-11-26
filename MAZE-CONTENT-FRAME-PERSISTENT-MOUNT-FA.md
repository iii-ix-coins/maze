# ثابت‌سازی ریشه‌ای قاب محتوای صفحه‌های بازی (Create / Rooms / Live / Room)

## علت واقعی

دو اصلاح قبلی (حذف `cgFade` و نگه‌داشتن کلاس `in-menu`) علت اصلی را نمی‌گرفتند، چون مشکل در **زمان ساخته‌شدن خودِ قاب** بود، نه در CSS آن.

- در صفحه‌های عادی سایت، قاب (`.route-page`) در **اولین رندر React** و هم‌زمان با Header و Dock ساخته می‌شد.
- در صفحه‌های بازی، قاب (`#mazeApp`) داخل `MazePage` بود و `MazePage` با `React.lazy` بارگذاری می‌شد. یعنی تا پایان دانلود chunk صفحه (و CSS آن) قاب اصلاً وجود نداشت. بعد از آن ناگهان ساخته می‌شد.
- پس از ساخته‌شدن قاب، محتوای داخل آن هم چند بار تغییر حالت می‌داد:
  1. `#createGame` به‌دلیل `display: flex` در `maze-unify.css` حتی پیش از `.show` نمایش داده می‌شد؛ پس تب Create پیش از آماده‌شدن موتور دیده می‌شد.
  2. برای `?view=rooms|live` یک `setInterval` هر ۱۵۰ms روی دکمهٔ تب کلیک می‌کرد؛ پس محتوا ابتدا Create بود و بعد به Rooms/Live می‌پرید.
  3. پس از آماده‌شدن موتور، `visible` و پیش‌نمایش Create (`playReveal`) شروع می‌شد.
- نتیجه: قاب و محتوا به‌صورت مرحله‌ای وارد می‌شدند، که به‌شکل «ورود با انیمیشن» دیده می‌شد.

## اصلاح

1. **`MazeFrame.tsx` (جدید، Eager):** قاب `#mazeApp`، `RouteScrollbar`، تم و همگام‌سازی کلاس‌های `in-menu / wide / spectating` از اولین commit React ساخته می‌شوند. تم و کلاس‌ها با `useLayoutEffect` پیش از اولین پینت اعمال می‌شوند.
2. **`App.tsx`:** `MazeFrame` به‌صورت Eager mount می‌شود و فقط محتوای داخلش (`<MazePage />`) lazy است. `fallback` متنی «Loading Maze…» حذف شد.
3. **`MazePage.tsx`:** فقط محتوا و راه‌اندازی موتور را برعهده دارد. `<main>`، تم، Observer کلاس‌ها و `setInterval` کلیک تب حذف شدند. لودر صفحه تا آماده‌شدن موتور (`maze:engine-ready`) می‌ماند، با سقف ۱۰ ثانیه.
4. **`maze-ui-store.ts`:** تب اولیه (`?view=`) پیش از اولین رندر خوانده می‌شود؛ منو از همان ابتدا روی تب درست ساخته می‌شود.
5. **`site.css`:**
   - `z-index: 1` قاب Maze اکنون در CSS اولیهٔ سایت تعریف می‌شود و به chunk تنبل Maze وابسته نیست.
   - تا پیش از `data-maze-engine-ready` فقط **محتوای** `#createGame` با `visibility: hidden` پنهان می‌ماند و بدون انیمیشن، در حالت نهایی ظاهر می‌شود. قاب، Border و Scrollbar همیشه بدون تغییر هستند. در خطای بوت، محتوا آزاد می‌شود (`data-maze-bootstrap-error`).
6. **`index.html`:** مسیر پیش از React همان‌گونه نرمال می‌شود که `normalizePath` در Router انجام می‌دهد (حروف بزرگ و `/` پایانی)، تا کلاس `in-menu` از همان اولین پینت درست باشد.
7. **`scripts/check-layout.mjs`:** کنترل رگرسیون برای Eager بودن قاب، نبود `setInterval`/کلیک تب، و وجود `readInitialHomeView` و CSS پنهان‌سازی محتوا اضافه شد.

## رفتار مورد انتظار

- Header، Dock و قاب محتوا در یک پینت و بدون هیچ انیمیشن یا ظهور تدریجی دیده می‌شوند.
- در طول بارگذاری chunk و موتور، قاب ثابت و خالی می‌ماند. محتوا فقط یک‌بار و آماده ظاهر می‌شود.
- `?view=rooms` و `?view=live` بدون پرش از Create باز می‌شوند.

## محدودهٔ محافظت‌شده

Game Loop، Simulation، الگوریتم Maze، Canvas، WebSocket، Room Store، پروتکل Multiplayer، Header، Dock و ساختار DOM موتور (IDها و کلاس‌ها) تغییر نکرده‌اند. انیمیشن‌های داخلی کنترل‌ها (مثل `playReveal` پیش‌نمایش Create) دست‌نخورده‌اند.

## اعتبارسنجی

- `check-layout`: موفق.
- منطق `?view=` اجرا و تأیید شد (create / rooms / live، و مقدار نامعتبر → create).
- `check:css:duplicates`، Typecheck کامل، Production Build و تست بصری مرورگر در این محیط اجرا نشدند (`node_modules` و مرورگر موجود نیست). پیش از انتشار `npm run check` و یک بار بررسی بصری با Throttling شبکه توصیه می‌شود.
