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

`MAZE_PUBLIC_URL` را در محیط Build می‌توان برای آدرس عمومی WebSocket تنظیم کرد. در حالت محلی، کلاینت در صورت خالی بودن مقدار، همان hostname را با پورت `8081` استفاده می‌کند. `MAZE_ALLOWED_ORIGINS` باید شامل Originهای دقیق سایت باشد؛ از `*` استفاده نکنید.

## حفظ سازگاری

DOM بازی، IDها، کلاس‌ها، Canvas Renderer، Game Loop، الگوریتم تولید ماز و پروتکل پیام‌ها از سورس TypeScript قبلی منتقل شده‌اند و بازنویسی نشده‌اند. React صفحه و محل Mount را مدیریت می‌کند؛ کنترلرهای بازی همچنان مستقیماً به DOM/Canvas متصل می‌شوند تا قراردادهای فعلی حفظ شوند.

صفحات قدیمی در `legacy/` برای مقایسه و Rollback باقی مانده‌اند.
