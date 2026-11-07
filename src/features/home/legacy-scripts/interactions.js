/**
 * HoLLd Interactions Engine (Views, Likes, Shares)
 * بروزرسانی‌شده برای همگام‌سازی زنده در تمام مرورگرها
 */
const initializeInteractions = () => {
    const likeBtn = document.getElementById('btn-like');
    const shareBtn = document.getElementById('btn-share');
    const likeCountEl = document.getElementById('like-count');
    const shareCountEl = document.getElementById('share-count');
    const viewCountEl = document.getElementById('view-count');

    const modal = document.getElementById('share-modal');
    const closeModalBtn = document.getElementById('btn-close-modal');
    const copyBtn = document.getElementById('btn-copy');
    const shareUrlInput = document.getElementById('share-url');

    async function copyShareUrl(button) {
        if (!button || button.disabled) {
            return false;
        }

        const input =
            document.getElementById('share-url');

        const image =
            button.querySelector('img');

        if (!input || !image) {
            return false;
        }

        const value =
            input.value.trim();

        if (!value) {
            return false;
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
                    value
                );
            } else {
                // -------------------------------------------------
                // Fallback
                // -------------------------------------------------
                input.focus();
                input.select();

                const copied =
                    document.execCommand('copy');

                if (!copied) {
                    throw new Error(
                        'Copy command failed.'
                    );
                }

                input.blur();
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
            // ثبت Share فقط بعد از Copy موفق
            // -------------------------------------------------
            fetch('/api/stats/share', {
                method: 'POST'
            })
                .then(res => {
                    if (!res.ok) {
                        throw new Error(
                            `Share request failed: ${res.status}`
                        );
                    }

                    return res.json();
                })
                .then(data => {
                    updateUI(data);
                })
                .catch(err => {
                    console.error(
                        'Failed to update share stats:',
                        err
                    );
                });

            // -------------------------------------------------
            // Restore COPY state
            // -------------------------------------------------
            setTimeout(() => {
                button.disabled = false;

                button.classList.remove(
                    'is-copied'
                );

                image.src =
                    originalSrc;

                image.alt =
                    originalAlt;

                if (originalTitle) {
                    button.title =
                        originalTitle;
                }

                button.setAttribute(
                    'aria-label',
                    'Copy Share Link'
                );

                modal.classList.remove(
                    'active'
                );

            }, 1500);

            return true;

        } catch (error) {
            console.error(
                'Failed to copy share URL:',
                error
            );

            return false;
        }
    }
    // فرمت کردن اعداد (مثلا 1500 میشه 1.5K)
    function formatNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    }

    // بروزرسانی UI با استفاده از ماشین انیمیشن Ticker (برای تغییرات روان اعداد)
    function updateUI(data, animate = true) {
        if (!data) return;

        if (window.ticker) {
            if (likeCountEl && typeof data.likes === 'number') {
                window.ticker.animate(likeCountEl, data.likes, {
                    duration: 50,
                    decimals: 0,
                    enableFlash: false,
                    formatter: (val) => formatNumber(Math.round(val))
                });
            }
            if (shareCountEl && typeof data.shares === 'number') {
                window.ticker.animate(shareCountEl, data.shares, {
                    duration: 50,
                    decimals: 0,
                    enableFlash: false,
                    formatter: (val) => formatNumber(Math.round(val))
                });
            }
            if (viewCountEl && typeof data.views === 'number') {
                window.ticker.animate(viewCountEl, data.views, {
                    duration: 50,
                    decimals: 0,
                    enableFlash: false,
                    formatter: (val) => formatNumber(Math.round(val))
                });
            }
        } else {
            // حالت پشتیبان اگر تیگر لود نشده باشد
            if (likeCountEl) likeCountEl.innerText = formatNumber(data.likes);
            if (shareCountEl) shareCountEl.innerText = formatNumber(data.shares);
            if (viewCountEl) viewCountEl.innerText = formatNumber(data.views);
        }
    }

    // تابع برای دریافت آخرین آمار از سرور
    let statsRequestInFlight = false;

    async function fetchStats(isViewAction = false) {
        if (statsRequestInFlight) {
            return;
        }

        statsRequestInFlight = true;

        const endpoint = isViewAction ? '/api/stats/view' : '/api/stats';
        const method = isViewAction ? 'POST' : 'GET';

        try {
            const response = await fetch(endpoint, {
                method,
                cache: 'no-store',
                headers: {
                    Accept: 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Stats request failed: ${response.status}`);
            }

            const data = await response.json();
            updateUI(data);
        } catch (error) {
            console.error('[Interactions] Stats request failed:', error);
        } finally {
            statsRequestInFlight = false;
        }
    }

    // ثبت یک بازدید در لحظه ورود کاربر و سپس همگام‌سازی دوره‌ای
    void fetchStats(true);

    const statsPollTimer = setInterval(() => {
        void fetchStats(false);
    }, 3000);

    window.addEventListener('beforeunload', () => {
        clearInterval(statsPollTimer);
    }, { once: true });

    // ۲. سیستم لایک (بی‌نهایت کلیک)
    if (likeBtn) {
        likeBtn.addEventListener('click', () => {
            // افکت تپش قلب فوری
            likeBtn.classList.remove('beat-anim');
            void likeBtn.offsetWidth;
            likeBtn.classList.add('beat-anim');

            // ارسال درخواست لایک به سرور
            fetch('/api/stats/like', { method: 'POST' })
                .then(res => res.json())
                .then(data => updateUI(data));
        });
    }

    // ۳. سیستم کپی و شیر
    if (shareBtn) {
        shareBtn.addEventListener('click', () => {
            modal.classList.add('active');
            shareUrlInput.value = window.location.href;
        });
    }

    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            modal.classList.remove('active');
        });
    }

    if (copyBtn) {
        copyBtn.addEventListener(
            'click',
            async () => {
                await copyShareUrl(
                    copyBtn
                );
            }
        );
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeInteractions, { once: true });
} else {
    initializeInteractions();
}
