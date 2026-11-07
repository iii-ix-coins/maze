'use strict';

(function mountTokenSummary() {

    const target =
        document.getElementById(
            'site-token-summary'
        );

    if (!target) {
        return;
    }

    target.className =
        'site-token-summary-host';

    target.innerHTML = `
        <section
            class="token-summary"
            aria-label="Token market summary"
        >

            <div class="token-summary-header">

                <div class="token-summary-identity">

                    <img
                        id="token-summary-icon"
                        class="token-summary-icon"
                        src="./css/images/hollld-logo.svg"
                        alt="Token"
                    >

                    <div class="token-summary-name">

                        <div
                            id="token-summary-name"
                            class="token-summary-title"
                        >
                            --
                        </div>

                        <div
                            id="token-summary-symbol"
                            class="token-summary-symbol"
                        >
                            --
                        </div>

                    </div>

                    <span
                        id="token-summary-verified"
                        class="token-summary-badge"
                        hidden
                    >
                        Verified
                    </span>

                </div>

                <a
                    href="./coin.html"
                    class="token-summary-link"
                >
                    Coin
                    <span>→</span>
                </a>

            </div>


            <div class="token-summary-grid">

                <div class="token-summary-item">
                    <span>Market Cap</span>
                    <strong data-market="mcap">--</strong>
                </div>

                <div class="token-summary-item">
                    <span>Liquidity</span>
                    <strong data-market="liquidity">--</strong>
                </div>

                <div class="token-summary-item">
                    <span>24h Volume</span>
                    <strong data-market="volume24h">--</strong>
                </div>

                <div class="token-summary-item">
                    <span>Holders</span>
                    <strong data-market="holders">--</strong>
                </div>

                <div class="token-summary-item">
                    <span>Organic Score</span>
                    <strong data-market="organic">--</strong>
                </div>

                <div class="token-summary-item">
                    <span>Net Buyers</span>
                    <strong data-market="netBuyers">--</strong>
                </div>

            </div>

        </section>
    `;

})();