# معماری Maze در ساختار تک‌ریشهٔ Vite + React

```text
maze-site/
├─ src/features/maze/          رابط بازی در اپلیکیشن React واحد
│  ├─ MazePage.tsx             React route surface و lifecycle adapter
│  ├─ maze-markup.html         markup اصلی، با ID و classهای بدون تغییر
│  ├─ engine/                  منطق بازی، State، Camera، Renderer و Game Loop
│  ├─ input/                   keyboard، pointer، joystick و minimap
│  ├─ net/                     Multiplayer WebSocket client
│  ├─ ui/                      کنترلرهای DOM فعلی برای Lobby، Rooms و Wizard
│  └─ styles/                  CSS بازی و فونت‌ها
├─ shared/maze/src/            قواعد ساخت ماز و پروتکل مشترک
├─ engines/maze-server/src/    Multiplayer WebSocket server
├─ tests/maze/                 تست‌های واحد و تست سرور
└─ legacy/                     HTML قدیمی برای مقایسه و بازگشت
```

## مرز React و موتور بازی

React/Vite یک Frontend واحد برای `/` و `/maze.html` فراهم می‌کند. صفحهٔ Maze و markup آن در React mount می‌شوند؛ پس از commit شدن DOM، موتور فعلی به همان IDها و کلاس‌ها متصل می‌شود. Canvas rendering، `requestAnimationFrame`، input handling، game state، الگوریتم generator و پیام‌های WebSocket به React منتقل یا بازنویسی نشده‌اند.

این جداسازی آگاهانه است: React نباید در هر فریم Canvas را re-render کند و مهاجرت UI نباید state یا زمان‌بندی بازی را تغییر دهد.

## مواردی که هنوز نیازمند اثبات Parity هستند

- ZIP ورودی فاقد نسخهٔ مرجع `legacy/mazeV3` بود؛ بنابراین تست A/B تاریخی از روی این بسته قابل اجرا نیست.
- تست‌های واحد و تست‌های سرور پس از نصب وابستگی‌ها از طریق `npm run test:maze` اجرا می‌شوند.
- ظاهر و عملکرد صفحهٔ اصلی و مسیرهای `/maze.html?view=create|rooms|live` باید در مرورگر، با viewport و دادهٔ ثابت، با نسخهٔ مرجع مقایسه شوند.
