# اصلاح وضعیت بصری دکمه‌های Navigation

## قرارداد جدید

- دکمه‌های مقصدی Dock (Home، Explore، Maze، Create، Notifications و Profile) دیگر Clip Path یا برش گوشه ندارند.
- پس‌زمینهٔ دکمه‌ها در حالت عادی، Hover، Focus و Active شفاف می‌ماند؛ Focus فقط با Outline دسترس‌پذیر مشخص می‌شود.
- Opacity حالت عادی: `0.55`.
- Opacity حالت فعال: `1`.
- گذار فقط روی Opacity و رنگ انجام می‌شود.
- ابعاد، Grid، مسیرها، آیکون‌ها و رفتار دکمه‌ها تغییر نکرده‌اند.

## محدودهٔ تغییر

- مالک CSS: `src/styles/site.css`
- قواعد Layout: بلوک مشترک `.site-bottom-nav .nav-link, .site-bottom-nav .nav-notifications-trigger`
- وضعیت Active: `.site-bottom-nav .nav-link.active`
- توکن `--site-navigation-active-surface` حذف شد، زیرا دکمه‌های Dock دیگر سطح فعال ندارند.
- قاب اصلی Dock و برش هندسی آن حفظ شده است.
- گزینه‌های عمودی Theme Selector همچنان کنترل مستقل انتخاب تم هستند و ظاهر انتخابی خود را حفظ می‌کنند.

## آزمون‌ها

- `scripts/check-layout.mjs`: بررسی Opacity عادی/فعال، شفافیت و حذف Clip Path دکمه‌ها.
- `scripts/check-css-duplicates.mjs`: بدون Selector/Property تکراری.
- `scripts/check-svg-theme.mjs`: قرارداد ریشه‌ای SVG و عدم استفاده از Surface برای Active Navigation.
