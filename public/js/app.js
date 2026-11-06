const markPageLoaded = () => {
    document.body.classList.remove('page-loading');
    document.body.classList.add('page-loaded');
};

// The React compatibility host loads this file after its first commit. Preserve
// the old load behaviour while also supporting a document that already loaded.
if (document.readyState === 'complete') {
    markPageLoaded();
} else {
    window.addEventListener('load', markPageLoaded, { once: true });
}

const initializeApp = () => {
    const slides = [
        { en: "Text and image slider for general tips and formulas" },
        { en: "Hold tokens in your wallet to automatically earn rewards every epoch." },
        { en: "No staking or locking required. Complete decentralization and safety." },
        { en: "New dynamically added slide example." }
    ];
    let currentSlide = 0;
    let slideInterval;
    const slideDuration = 7272;
    const sliderContent = document.getElementById('slider-content');
    const prevBtn = document.getElementById('prev-slide');
    const nextBtn = document.getElementById('next-slide');
    const dotsContainer = document.getElementById('slider-dots-container');
    function initDots() {
        if (!dotsContainer) return;
        dotsContainer.innerHTML = '';
        slides.forEach((_, index) => {
            const dot = document.createElement('span');
            dot.classList.add('dot');
            dot.addEventListener('click', () => {
                goToSlide(index);
                resetAutoPlay();
            });
            dotsContainer.appendChild(dot);
        });
    }
    function renderSlide(index) {
        if (!sliderContent) return;
        const slide = slides[index];
        sliderContent.style.opacity = '0';
        setTimeout(() => {
            sliderContent.innerHTML = `<p class="slider-title">${slide.en}</p>`;
            sliderContent.style.opacity = '1';
        }, 200);
        if (dotsContainer) {
            const dots = dotsContainer.querySelectorAll('.dot');
            dots.forEach((dot, i) => {
                dot.classList.toggle('active', i === index);
            });
        }
    }
    function nextSlide() {
        currentSlide = (currentSlide + 1) % slides.length;
        renderSlide(currentSlide);
    }
    function prevSlideFunc() {
        currentSlide = (currentSlide - 1 + slides.length) % slides.length;
        renderSlide(currentSlide);
    }
    function goToSlide(index) {
        currentSlide = index;
        renderSlide(currentSlide);
    }
    function resetAutoPlay() {
        clearInterval(slideInterval);
        slideInterval = setInterval(nextSlide, slideDuration);
    }
    if (prevBtn && nextBtn) {
        prevBtn.addEventListener('click', () => {
            prevSlideFunc();
            resetAutoPlay();
        });
        nextBtn.addEventListener('click', () => {
            nextSlide();
            resetAutoPlay();
        });
    }
    initDots();
    renderSlide(currentSlide);
    slideInterval = setInterval(nextSlide, slideDuration);

    async function loadConfigAndLinks() {
        try {
            const res = await fetch('/api/config');

            if (!res.ok) {
                throw new Error(
                    `Config request failed: ${res.status}`
                );
            }

            const config = await res.json();

            if (config && config.mintAddress) {
                const mint = String(
                    config.mintAddress
                ).trim();

                // -------------------------------------------------
                // Existing action links
                // -------------------------------------------------
                const pumpBtn =
                    document.getElementById('btn-pump');

                const solscanBtn =
                    document.getElementById('btn-solscan');

                const jupiterBtn =
                    document.getElementById('btn-jupiter');

                if (pumpBtn) {
                    pumpBtn.href =
                        `https://pump.fun/coin/${mint}`;
                }

                if (solscanBtn) {
                    solscanBtn.href =
                        `https://solscan.io/token/${mint}`;
                }

                if (jupiterBtn) {
                    jupiterBtn.href =
                        `https://jup.ag/tokens/${mint}`;
                }

                // -------------------------------------------------
                // Mint address display
                // -------------------------------------------------
                const mintAddressEl =
                    document.getElementById(
                        'mint-address-value'
                    );

                if (mintAddressEl) {
                    mintAddressEl.textContent = mint;
                    mintAddressEl.title = mint;
                    mintAddressEl.dataset.address = mint;
                }

                // -------------------------------------------------
                // Mint address copy button
                // -------------------------------------------------
                const copyMintBtn =
                    document.getElementById(
                        'btn-copy-mint'
                    );

                if (copyMintBtn) {
                    copyMintBtn.onclick =
                        async () => {
                            await copyMintAddress(
                                mint,
                                copyMintBtn
                            );
                        };
                }
            }

        } catch (err) {
            console.error(
                'Failed to load config:',
                err
            );

            const mintAddressEl =
                document.getElementById(
                    'mint-address-value'
                );

            if (mintAddressEl) {
                mintAddressEl.textContent =
                    'Unavailable';
            }
        }
    }

    async function copyMintAddress(
        mint,
        button
    ) {
        if (!mint || !button) {
            return;
        }

        // جلوگیری از اجرای دوباره در حالت Copied
        if (button.disabled) {
            return;
        }

        const image =
            button.querySelector('img');

        if (!image) {
            return;
        }

        const originalSrc =
            image.getAttribute('src');

        const originalAlt =
            image.getAttribute('alt');

        const originalTitle =
            button.getAttribute('title');

        try {
            // -------------------------------------------------
            // Clipboard API
            // -------------------------------------------------
            if (
                navigator.clipboard &&
                window.isSecureContext
            ) {
                await navigator.clipboard.writeText(
                    mint
                );
            } else {
                // -------------------------------------------------
                // Clipboard fallback
                // -------------------------------------------------
                const textarea =
                    document.createElement(
                        'textarea'
                    );

                textarea.value = mint;

                textarea.style.position =
                    'fixed';

                textarea.style.left =
                    '-9999px';

                textarea.style.top =
                    '0';

                textarea.style.opacity =
                    '0';

                document.body.appendChild(
                    textarea
                );

                textarea.focus();
                textarea.select();

                const copied =
                    document.execCommand(
                        'copy'
                    );

                textarea.remove();

                if (!copied) {
                    throw new Error(
                        'Copy command failed.'
                    );
                }
            }

            // -------------------------------------------------
            // COPIED STATE
            // -------------------------------------------------

            button.disabled = true;

            button.classList.add(
                'is-copied'
            );

            image.src =
                './css/images/copied-logo.svg';

            image.alt =
                'Copied';

            button.title =
                'Copied';

            button.setAttribute(
                'aria-label',
                'Copied'
            );

            // -------------------------------------------------
            // Restore COPY state
            // -------------------------------------------------

            setTimeout(() => {
                button.disabled =
                    false;

                button.classList.remove(
                    'is-copied'
                );

                image.src =
                    originalSrc;

                image.alt =
                    originalAlt;

                if (
                    originalTitle
                ) {
                    button.title =
                        originalTitle;
                }

                button.setAttribute(
                    'aria-label',
                    'Copy Mint Address'
                );

            }, 1500);

        } catch (error) {
            console.error(
                'Failed to copy mint address:',
                error
            );
        }
    }

    async function initCoinAge() {
        try {
            const res = await fetch('/api/coin-age');
            const data = await res.json();
            if (!data.launchDate) return;

            const launchTime = new Date(data.launchDate).getTime();

            function updateAge() {
                const now = Date.now();
                const diffMs = Math.max(now - launchTime, 0);

                // محاسبات تقویمی دقیق برای سال، ماه، روز، ساعت و دقیقه
                const seconds = Math.floor(diffMs / 1000);
                const minutes = Math.floor(seconds / 60);
                const hours = Math.floor(minutes / 60);
                const days = Math.floor(hours / 24);

                const years = Math.floor(days / 365);
                const remainingDaysAfterYears = days % 365;
                const months = Math.floor(remainingDaysAfterYears / 30);
                const finalDays = remainingDaysAfterYears % 30;
                const finalHours = hours % 24;
                const finalMinutes = minutes % 60;

                // ساخت رشته‌ی خروجی و فیلتر کردن مقادیر صفر
                let parts = [];
                if (years > 0) parts.push(`${years}y`);
                if (months > 0) parts.push(`${months}mo`);
                if (finalDays > 0) parts.push(`${finalDays}d`);
                if (finalHours > 0) parts.push(`${finalHours}h`);

                // اگر دقیقه صفر بود و هیچ واحد دیگری وجود نداشت، حداقل 0M نشان داده شود تا خالی نماند
                if (finalMinutes > 0 || parts.length === 0) {
                    parts.push(`${finalMinutes}m`);
                }

                const text = parts.join(' ');

                const ageEl = document.getElementById('coin-age-val');
                if (ageEl) {
                    ageEl.innerText = text;
                }
            }

            updateAge();
            setInterval(updateAge, 10000);
        } catch (err) {
            console.error("Failed to load coin age:", err);
        }
    }

    initCoinAge();

    async function fetchLiveMetrics() {
        try {
            const response = await fetch('/api/live-price');
            if (!response.ok) return;
            const data = await response.json();
            if (data && typeof data.priceUsd === 'number') {
                window.ticker.animate(
                    'price-val',
                    data.priceUsd,
                    {
                        duration: 1000,
                        enableFlash: true,
                        formatter: value => {

                            const number =
                                Number(value);

                            if (!Number.isFinite(number)) {
                                return '--';
                            }

                            return new Intl.NumberFormat(
                                'en-US',
                                {
                                    style: 'currency',
                                    currency: 'USD',
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 8
                                }
                            ).format(number);
                        }
                    }
                );
            }
            if (data && typeof data.liquidityUsd === 'number') {
                window.ticker.animate(
                    'liquidity-val',
                    data.liquidityUsd,
                    {
                        duration: 1000,
                        enableFlash: false,
                        formatter: value =>
                            window.HollldNumberFormatter.usd(
                                value
                            )
                    }
                );
            }
            if (data && data.changes) {
                updateChangePill('change-1m', data.changes['1m']);
                updateChangePill('change-5m', data.changes['5m']);
                updateChangePill('change-24h', data.changes['24h']);
                updateChangePill('change-30d', data.changes['30d']);
            }
        } catch (err) {
        }
    }

    async function fetchJupiterMarketMetrics() {
        try {
            const response = await fetch(
                '/api/jupiter-market',
                { cache: 'no-store' }
            );

            if (!response.ok) return;

            const payload = await response.json();

            const token = payload?.data?.tokenV2;

            if (!token) return;

            // --------------------------------
            // Market Cap
            // --------------------------------

            const marketCap = Number(token.mcap);

            if (
                token.mcap !== null &&
                token.mcap !== undefined &&
                Number.isFinite(marketCap)
            ) {
                window.ticker.animate(
                    'market-cap-val',
                    marketCap,
                    {
                        duration: 1000,
                        enableFlash: false,
                        formatter: value =>
                            window.HollldNumberFormatter.usd(value)
                    }
                );
            }

            // --------------------------------
            // 24h Volume
            // --------------------------------

            const stats24h = token.stats24h;

            const buyVolume = Number(stats24h?.buyVolume);
            const sellVolume = Number(stats24h?.sellVolume);

            if (
                stats24h?.buyVolume != null &&
                stats24h?.sellVolume != null &&
                Number.isFinite(buyVolume) &&
                Number.isFinite(sellVolume)
            ) {
                const totalVolume = buyVolume + sellVolume;

                window.ticker.animate(
                    'volume-24h-val',
                    totalVolume,
                    {
                        duration: 1000,
                        enableFlash: false,
                        formatter: value =>
                            window.HollldNumberFormatter.usd(value)
                    }
                );
            }

        } catch (err) {
            console.error(
                'Failed to load Jupiter market metrics:',
                err
            );
        }
    }

    function updateChangePill(elementId, val) {
        const el = document.getElementById(elementId);
        if (!el) return;
        if (val === null || val === undefined) {
            el.innerText = 'Coming soon';
            el.style.color = 'gray';
            el.classList.remove('text-gain', 'text-loss');
        } else {
            el.style.color = '';
            window.ticker.animate(el, Number(val), {
                duration: 1000,
                decimals: 2,
                enableFlash: false,
                formatter: (currentVal) => {
                    const sign = currentVal >= 0 ? '+' : '';
                    if (val >= 0) {
                        el.classList.remove('text-loss');
                        el.classList.add('text-gain');
                    } else {
                        el.classList.remove('text-gain');
                        el.classList.add('text-loss');
                    }
                    return `${sign}${currentVal.toFixed(2)} %`;
                }
            });
        }
    }
    loadConfigAndLinks();
    const livePriceElement = document.getElementById('price-val');

    if (livePriceElement) {
        fetchLiveMetrics();
        const livePriceTimer = setInterval(fetchLiveMetrics, 2000);
        window.addEventListener('beforeunload', () => {
            clearInterval(livePriceTimer);
        }, { once: true });
    }
    const marketCapElement =
        document.getElementById('market-cap-val');

    const volumeElement =
        document.getElementById('volume-24h-val');

    if (marketCapElement || volumeElement) {

        fetchJupiterMarketMetrics();

        const jupiterMetricsTimer = setInterval(
            fetchJupiterMarketMetrics,
            30000
        );

        window.addEventListener('beforeunload', () => {
            clearInterval(jupiterMetricsTimer);
        }, { once: true });
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp, { once: true });
} else {
    initializeApp();
}
