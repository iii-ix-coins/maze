# اصلاح شفافیت سطوح و دکمه Create

## تغییرات

- پس‌زمینهٔ Home Hero در تم Grass از توکن ریشه‌ای `--home-hero-surface` مقدار `transparent` می‌گیرد.
- لایهٔ Glow مربوط به Hero نیز در Grass شفاف است.
- پس‌زمینهٔ بدنهٔ Dock و حالت Active لینک‌های Dock در Grass شفاف شده‌اند؛ ساختار، Border، موقعیت و تعامل‌ها حفظ شده‌اند.
- پس‌زمینهٔ Summary، کنترل Refresh، فیلترها، کارت‌های Game Feed، بخش Art و وضعیت‌های Empty/Message در Grass شفاف شده‌اند.
- مقادیر Light و Dark برای سطوح این بخش‌ها حفظ شده است.
- پس‌زمینهٔ Create در هر سه تم از گرادیان طلایی مشترک `--create-button-gradient` استفاده می‌کند.
- رنگ آیکون Create با tone مستقل `create` و توکن `--svg-icon-create` تنظیم شده تا در هر سه تم روی طلایی خوانا بماند.
- رنگ اصلی و ثانویهٔ SVGها در Grass به `--slime-lime` و `--radioactive-grass` روشن‌تر تغییر کرده است.

## معماری

هیچ Override تم‌محور جدیدی به انتهای CSS اضافه نشده است. مقادیر در بلوک‌های اصلی هر تم در `theme-tokens.css` تعریف شده‌اند و CSS کامپوننت‌ها فقط توکن‌های معنایی را مصرف می‌کند. متغیرهای عمومی `--surface-solid`، `--panel-bg` و `--tile-bg` تغییر داده نشده‌اند تا Create Game و Lobby تحت تأثیر قرار نگیرند.

## اعتبارسنجی

- اسکریپت `check-svg-theme.mjs` توسعه یافت تا توکن‌های شفاف Grass، رنگ روشن SVG، گرادیان Create و استفاده از توکن‌های semantic در CSS را بررسی کند.
- `node scripts/check-layout.mjs`: موفق.
- `node scripts/check-css-duplicates.mjs`: موفق؛ ۲۰ فایل CSS.
- `node scripts/check-svg-theme.mjs`: موفق؛ سه هشدار دربارهٔ تصاویر پس‌زمینهٔ قدیمی و از قبل مفقود `3D-bg-*`.
- Parse مستقل با `tinycss2`: هر ۲۰ فایل CSS بدون خطای نحوی.
- بررسی قراردادی توکن‌ها: شفافیت Home/Navigation در Grass، رنگ روشن SVG و گرادیان مشترک Create تأیید شد.
- Typecheck و Vite Build اجرا نشدند، چون `node_modules` در آرشیو/محیط موجود نیست.
- تست بصری واقعی مرورگر انجام نشده است.
