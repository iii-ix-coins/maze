'use strict';
export function createBanner() {
    const banner =
        document.createElement('section');
    banner.className =
        'banner';
    banner.innerHTML = `
        <div class="banner-left">
            <img
                class="banner-logo"
                src="./css/images/hollld-text-logo.svg"
                alt="Hollld"
            >
            <div class="age">
                <img
                    id="created-ago"
                    src="./css/images/age.svg"
                    alt="Coin age"
                >
                <div
                    id="coin-age-val"
                    class="age-val"
                ></div>
            </div>
        </div>

        <!-- Text & Image Slider -->
        <div class="slider-card">
            <button
                id="prev-slide"
                class="slider-btn prev"
                type="button"
                aria-label="Previous Slide"
            >
                <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    aria-hidden="true"
                >
                    <polyline
                        points="15 18 9 12 15 6"
                    ></polyline>
                </svg>
            </button>

            <button
                id="next-slide"
                class="slider-btn next"
                type="button"
                aria-label="Next Slide"
            >
                <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    aria-hidden="true"
                >
                    <polyline
                        points="9 18 15 12 9 6"
                    ></polyline>
                </svg>
            </button>

            <div
                id="slider-content"
                class="slider-content"
            ></div>

            <div
                id="slider-dots-container"
                class="slider-dots"
                aria-label="Slider navigation"
            ></div>
        </div>
    `;
    return banner;
}

export function mountBanner(
    target
) {
    if (!target) {
        return null;
    }
    const banner =
        createBanner();
    target.replaceChildren(
        banner
    );
    return banner;
}