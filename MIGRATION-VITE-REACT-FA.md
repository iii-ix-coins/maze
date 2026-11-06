# راهنمای ساختار واحد Vite + React

## وضعیت معماری

اکنون ریشهٔ `maze-site` تنها پروژهٔ Vite است. صفحهٔ اصلی `/` و بازی `/maze.html` هر دو از یک `index.html` و یک ورودی React بارگذاری می‌شوند؛ Vite نیز هر دو را در یک خروجی `dist/site` می‌سازد.

**مرزبندی دقیق مهاجرت:** در این نسخه یک Vite در ریشه و یک React root برای همهٔ مسیرهای Frontend وجود دارد. این به معنی بازنویسی کامل همهٔ کنترلرهای قدیمی به React نیست: کنترلرهای Home فعلاً از پل سازگاری وارد می‌شوند و موتور Canvas/بازی نیز TypeScript مستقل باقی می‌ماند. این تصمیم برای جلوگیری از تغییر عملکرد است؛ بازنویسی داخلی React باید جداگانه و پس از تست Parity انجام شود.

## ساختار

```text
maze-site/
├── package.json                 # اسکریپت‌ها و وابستگی‌های ریشه
├── vite.config.ts               # تنها پیکربندی Frontend
├── scripts/build-maze-server.mjs # Build سرور Node با esbuild
├── index.html                   # ورودی مشترک React
├── tsconfig.json
├── vitest.config.ts
│
├── src/
│   ├── main.tsx
│   ├── app/                     # App، Router، Providers و Error Boundary
│   ├── components/              # Layout، Navigation، Modal و عناصر مشترک
│   ├── features/
│   │   ├── home/                # React shell و compatibility runtime فعلی
│   │   ├── market/              # مرز Feature بازار
│   │   ├── holders/              # مرز Feature هولدرها
│   │   ├── live-feed/            # مرز Feature فید زنده
│   │   ├── coin/                 # اطلاعات توکن
│   │   ├── interaction/          # Like / Share / Views
│   │   ├── theme/                # Theme state/bridge
│   │   └── maze/
│   │       ├── MazePage.tsx      # صفحه Maze در React
│   │       ├── maze-markup.html  # DOM اصلی با حفظ ID و classها
│   │       ├── engine-entry.ts   # نقطه ورود موتور TypeScript
│   │       ├── components/
│   │       ├── adapters/
│   │       ├── lobby/
│   │       ├── rooms/
│   │       ├── create-game/
│   │       ├── live/
│   │       ├── race/
│   │       ├── canvas/
│   │       ├── engine/
│   │       ├── input/
│   │       ├── net/
│   │       ├── ui/               # پیاده‌سازی موجود کنترل‌های DOM بازی
│   │       └── styles/
│   ├── services/
│   ├── hooks/
│   ├── types/
│   ├── utils/
│   └── styles/
│
├── public/
│   ├── css/                      # CSS فعلی با همان URLها و محتوا
│   ├── fonts/                    # کپی در دسترس برای ساختار جدید
│   ├── js/                       # Theme initializer و نسخه‌های rollback
│   └── maze-assets/              # دارایی‌های قدیمی برای Rollback
│
├── engines/
│   ├── holder-engine/
│   ├── interaction-engine/
│   ├── pclqch-engine/
│   ├── tx-engine/
│   ├── verify-engine/
│   └── maze-server/              # منبع سرور Multiplayer بازی
├── shared/
│   ├── services/
│   ├── state/
│   └── maze/                     # قواعد ساخت Maze و پروتکل فعلی
├── tests/maze/                  # تست‌های فعلی بازی
├── docs/maze/
├── legacy/                      # صفحات HTML قبلی برای مقایسه/بازگشت
├── server.js
└── start.js
```

## اجرا

در بستهٔ تحویلی Lockfile قبلی حذف شده است، چون با وابستگی‌های React/Vite همگام نبود. ابتدا `npm install` اجرا کنید تا Lockfile جدید ایجاد شود؛ سپس از `npm ci` استفاده کنید.

```bat
npm install
npm run build:all
npm start
```

برای توسعه فرانت‌اند، در CMD جداگانه:

```bat
npm run dev:site
```

برای Multiplayer، اگر سرور آن را توسط PM2 یا محیط استقرار اجرا نمی‌کنید:

```bat
npm run start:maze-server
```

آدرس توسعه: `http://localhost:5173/` و `http://localhost:5173/maze.html`.
آدرس Production: `http://localhost:5000/` و `http://localhost:5000/maze.html`.

## اصل حفظ رفتار

- CSS، فونت‌ها، Asset URLها و ترتیب stylesheetهای قبلی حفظ شده‌اند.
- سورس اسکریپت‌های Home در `src/features/home/legacy-scripts` قرار دارد و Vite آن‌ها را مدیریت می‌کند. ماژول‌های ES از گراف Vite وارد و اسکریپت‌های کلاسیک به‌صورت asset اجرا می‌شوند تا scope سراسری و ترتیب اجرای قبلی حفظ شود. این کنترلرها هنوز بازنویسی کامل به React state/components نشده‌اند.
- رابط Maze از طریق یک React page/portal در همان سند و همان React root نمایش داده می‌شود؛ DOM اصلی با حفظ IDها و classها به‌عنوان template در React Mount می‌شود تا قرارداد موتور تغییر نکند. موتور Canvas و کنترلرهای DOM همچنان TypeScript imperative هستند و توسط Vite bundle می‌شوند، نه اینکه به React state بازنویسی شده باشند.
- Game Loop، Canvas Renderer، الگوریتم Generator، LocalStorage و WebSocket protocol بازنویسی نشده‌اند.
- Express، APIها، موتورهای قیمت/تراکنش/هولدر/تعامل و فایل‌های State حفظ شده‌اند.
- `legacy/home.html` و `legacy/maze.html` فقط برای rollback و مقایسه هستند؛ مسیرهای عادی اکنون React/Vite هستند.

## محدودیت آزمون Parity

تست مقایسه‌ای تاریخی Maze به سورس قدیمی `legacy/mazeV3` نیاز دارد که در ZIP ورودی موجود نبود. تست‌های واحد فعلی از طریق `npm run test:maze` قابل اجرا هستند؛ parity تصویری تاریخی پس از بازیابی baseline انجام می‌شود.
