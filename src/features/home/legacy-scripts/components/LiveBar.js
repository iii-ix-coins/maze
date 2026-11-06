'use strict';
(function mountLiveBar() {
    const target =
        document.getElementById(
            'site-live-bar'
        );
    if (!target) {
        return;
    }
    target.className =
        'site-live-bar-host';
    target.innerHTML = `
        <div class="live-bar">
            <div class="live-bar-menu">
                <button
                    id="last-24h-buyers"
                    class="live-menu-btn is-active"
                    type="button"
                    data-live-feed="buyers"
                >
                    Last 100 Purchases
                </button>
                <button
                    id="top-holders"
                    class="live-menu-btn"
                    type="button"
                    data-live-feed="holders"
                >
                    Top 100 Holders
                </button>
                <button
                    id="last-24h-winners"
                    class="live-menu-btn"
                    type="button"
                    disabled
                    aria-disabled="true"
                >
                    Last 100 Wins
                </button>
                <button
                    id="top-winners"
                    class="live-menu-btn"
                    type="button"
                    disabled
                    aria-disabled="true"
                >
                    Top 100 Wins
                </button>
            </div>
            <div
                id="live-feed-panel"
                class="live-feed-panel"
            ></div>
        </div>
    `;
})();