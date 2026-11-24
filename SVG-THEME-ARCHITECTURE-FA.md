# معماری سراسری رنگ‌آمیزی SVG در سه تم

## هدف

رنگ آیکون‌ها و نشان‌های برداری متعلق به خود Maze باید از یک قرارداد مرکزی پیروی کند. برای این کار، فایل‌های SVG اصلی دست‌کاری نمی‌شوند و رنگ آن‌ها با Overrideهای پراکنده در صفحات مختلف تعیین نمی‌شود.

## منبع حقیقت رنگ

فایل مالک رنگ‌ها: `src/styles/theme-tokens.css`

چهار توکن معنایی برای هر تم تعریف شده‌اند:

| توکن | Light | Dark | Grass |
|---|---|---|---|
| `--svg-icon-primary` | `#333333` | `#ffffff` | `#004b23` |
| `--svg-icon-secondary` | `#555555` | `#c4c4c4` | `#007200` |
| `--svg-icon-accent` | `#333333` | `#ffffff` | `#ccff33` |
| `--svg-icon-on-accent` | `#ffffff` | `#000000` | `#004b23` |

کامپوننت `src/components/media/ThemedSvgIcon.tsx` فایل SVG را به‌عنوان alpha mask می‌خواند: خود SVG فقط هندسه و شفافیت را تأمین می‌کند و رنگ از توکن فعال سند می‌آید. در نتیجه فایل‌های منبع SVG تغییر نمی‌کنند.

## موارد متصل‌شده

- Dock: Home، Explore، Maze، Create، Notifications و Profile
- آیکون‌های Theme Switcher
- Wordmark در Site Chrome و نشان Page Loader
- لوگوی Maze Coin در Market Summary
- چهار تصویر برداری Hero Slider که فقط خطوط/شکل برداری دارند
- آیکون‌های مرحله‌های Create Game که به‌صورت stencil استفاده می‌شوند
- Inline SVGهای Explore، Profile، Wallet UI و Lobby که از `currentColor` استفاده می‌کنند
- Identicon پیش‌فرض کاربر که رنگ آن از توکن اصلی SVG می‌آید

## نحوهٔ افزودن SVG جدید

1. فایل را در `public/` نگه دارید و URL هم‌مبدأ آن را مشخص کنید.
2. اگر آیکون تک‌رنگ یا نشان داخلی Maze است، از `ThemedSvgIcon` استفاده کنید.
3. اگر SVG درون JSX ساخته شده، از `currentColor` در `stroke` یا `fill` استفاده کرده و کلاس `theme-svg-inline` بدهید.
4. اگر آیکون باید روی سطح رنگی متضاد باشد، tone مناسب (`primary`, `secondary`, `accent`, `on-accent`) را به `ThemedSvgIcon` بدهید.
5. برای recolor کردن یک آیکون، Selector مخصوص هر تم در فایل Feature اضافه نکنید؛ توکن معنایی را در `theme-tokens.css` تغییر دهید.

## مواردی که عمداً به‌صورت خودکار recolor نمی‌شوند

- عکس پروفایل واقعی کاربر؛ تصویر هویتی کاربر است، نه آیکون UI.
- لوگوهای رسمی سرویس‌های ثالث؛ رنگ رسمی برند باید حفظ شود.
- آیکون متادیتای Reown AppKit؛ در UI مستقل سرویس Wallet استفاده می‌شود و از CSS صفحه ارث‌بری نمی‌کند.
- Favicon مرورگر؛ در Chrome/Firefox خارج از DOM صفحه نمایش داده می‌شود و CSS صفحه روی آن اعمال نمی‌شود.
- فایل‌های فونت SVG؛ تصویر آیکون نیستند.

## محدودیت موجود در ZIP مبنا

`MazeBackground.tsx` به سه فایل `/css/images/3D-bg-grass.svg`, `/css/images/3D-bg-dark.svg` و `/css/images/3D-bg-light.svg` ارجاع می‌دهد، اما این سه فایل در `last-maze.zip` موجود نیستند. به همین دلیل آن‌ها را تولید یا حدس نزده‌ایم. پس از اضافه شدن فایل‌های واقعی می‌توان آن‌ها را جداگانه با توجه به ماهیت تصویری‌شان به همین قرارداد متصل کرد.

## اعتبارسنجی

اسکریپت `scripts/check-svg-theme.mjs` وجود توکن‌های هر سه تم، استفاده از کامپوننت مرکزی و حضور فایل‌های SVG ثبت‌شده در مسیرهای عمومی را بررسی می‌کند. اجرای آن با فرمان زیر انجام می‌شود:

```bash
npm run check:svg-theme
```

این بررسی به زنجیرهٔ `npm run check` نیز اضافه شده است.
