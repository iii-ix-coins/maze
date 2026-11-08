# یکپارچه‌سازی Maze با Frontend واحد Vite + React

کلاینت بازی در مسیر `src/features/maze/` قرار گرفته است و صفحهٔ `/maze.html` همان ورودی React/Vite سایت را استفاده می‌کند. دیگر برای Frontend بازی Build جداگانه‌ای در `maze-v4/apps/web` وجود ندارد.

## Build و اجرا

```bash
npm install
npm run build:all
npm start
```

برای توسعهٔ Frontend، در ترمینال دوم `npm run dev:site` را اجرا کنید. سرور Multiplayer مستقل است و در محیط محلی با `npm run start:maze-server` اجرا می‌شود؛ پورت پیش‌فرض آن `8081` است.

## تنظیم WebSocket

`MAZE_PUBLIC_URL` باید در متغیرهای Build سرویس `site` روی آدرس عمومی WebSocket سرویس مستقل `maze-server` تنظیم شود؛ برای نمونه `wss://<maze-server-public-domain>`. کلاینت فقط در محیط محلی (`localhost` / `127.0.0.1`) در صورت خالی بودن این مقدار به پورت `8081` برمی‌گردد و در Production آدرس سرویس را حدس نمی‌زند.

در متغیرهای Runtime سرویس `maze-server`، مقدار `MAZE_ALLOWED_ORIGINS` را روی Origin دقیق سایت قرار دهید؛ برای نمونه `https://maze-coin.up.railway.app` (بدون مسیر). اگر این مقدار خالی باشد، کنترل پیش‌فرض same-host برای دو سرویس مستقل Railway اتصال مرورگر را رد می‌کند. از `*` استفاده نکنید.

## حفظ سازگاری

DOM بازی، IDها، کلاس‌ها، Canvas Renderer، Game Loop، الگوریتم تولید ماز و پروتکل پیام‌ها از سورس TypeScript قبلی منتقل شده‌اند و بازنویسی نشده‌اند. React صفحه و محل Mount را مدیریت می‌کند؛ کنترلرهای بازی همچنان مستقیماً به DOM/Canvas متصل می‌شوند تا قراردادهای فعلی حفظ شوند.

صفحات قدیمی در `legacy/` برای مقایسه و Rollback باقی مانده‌اند.
