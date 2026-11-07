'use strict';

(function mountCoinPage() {

    const target =
        document.getElementById(
            'site-coin-page'
        );

    if (!target) {
        return;
    }

    target.className =
        'site-coin-page-host';

    target.innerHTML = `

        <main
            class="coin-page"
            aria-label="Coin information"
        >

            <!-- =================================================
                 HERO
                 ================================================= -->

            <section class="coin-hero">

                <div class="coin-identity">

                    <img
                        id="coin-icon"
                        class="coin-icon"
                        src="./css/images/hollld-logo.svg"
                        alt="Coin"
                    >

                    <div class="coin-identity-text">

                        <div class="coin-name-row">

                            <h1
                                id="coin-name"
                                class="coin-name"
                            >
                                --
                            </h1>

                            <span
                                id="coin-verified"
                                class="coin-verified"
                                hidden
                            >
                                Verified
                            </span>

                        </div>

                        <div
                            id="coin-symbol"
                            class="coin-symbol"
                        >
                            --
                        </div>

                    </div>

                </div>

                <div class="coin-hero-meta">

                    <span
                        id="coin-launchpad"
                        class="coin-chip"
                    >
                        --
                    </span>

                    <div
                        id="coin-score"
                        class="coin-score"
                        role="img"
                        aria-label="Organic score"
                        style="--score: 0"
                    >
                        <b id="coin-score-value">--</b>
                        <span>Organic</span>
                        <i
                            id="coin-organic-score"
                            class="sr-only"
                        >Organic --</i>
                    </div>

                </div>

            </section>


            <!-- =================================================
                 MINT
                 ================================================= -->

            <section class="coin-address-card">

                <div class="coin-address-label">
                    Mint
                </div>

                <code
                    id="coin-mint"
                    class="coin-address"
                >
                    --
                </code>

            </section>


            <!-- =================================================
                 OVERVIEW
                 ================================================= -->

            <section class="coin-section">

                <div class="coin-section-title">
                    Market Overview
                </div>

                <div class="coin-metric-grid">

                    <div class="coin-metric">
                        <span>Price</span>
                        <strong id="coin-price">--</strong>
                        <div id="coin-sparkline" class="coin-sparkline" hidden></div>
                    </div>

                    <div class="coin-metric">
                        <span>24h</span>
                        <strong id="coin-price-change" data-tone-auto>--</strong>
                    </div>

                    <div class="coin-metric">
                        <span>Market Cap</span>
                        <strong id="coin-mcap">--</strong>
                    </div>

                    <div class="coin-metric">
                        <span>FDV</span>
                        <strong id="coin-fdv">--</strong>
                    </div>

                    <div class="coin-metric">
                        <span>Liquidity</span>
                        <strong id="coin-liquidity">--</strong>
                    </div>

                    <div class="coin-metric">
                        <span>Holders</span>
                        <strong id="coin-holders">--</strong>
                    </div>

                    <div class="coin-metric">
                        <span>Circulating</span>
                        <strong id="coin-circ-supply">--</strong>
                    </div>

                    <div class="coin-metric">
                        <span>Total Supply</span>
                        <strong id="coin-total-supply">--</strong>
                    </div>

                </div>

            </section>


            <!-- =================================================
                 MARKET PERFORMANCE
                 ================================================= -->

            <section class="coin-section">

                <div class="coin-section-title">
                    Market Performance
                </div>

                <div
                    id="coin-period-grid"
                    class="coin-period-grid"
                ></div>

            </section>


            <!-- =================================================
                 TRADING FLOW
                 ================================================= -->

            <section class="coin-section">

                <div class="coin-section-title">
                    24h Trading Flow
                </div>

                <div
                    id="coin-flow-meter"
                    class="coin-flow-meter"
                    style="--buy: 50"
                    data-lean="even"
                >

                    <div class="coin-flow-meter-head">
                        <span>Buy / Sell Pressure</span>
                        <b id="coin-flow-meter-lean">--</b>
                    </div>

                    <div class="coin-flow-meter-bar">
                        <i class="coin-flow-meter-buy"></i>
                        <i class="coin-flow-meter-sell"></i>
                    </div>

                    <div class="coin-flow-meter-labels">
                        <span id="coin-flow-meter-buy">Buy --</span>
                        <span id="coin-flow-meter-sell">Sell --</span>
                    </div>

                </div>

                <div class="coin-flow-grid">

                    <div class="coin-flow-card">
                        <span>Buy Volume</span>
                        <strong id="coin-buy-volume">--</strong>
                    </div>

                    <div class="coin-flow-card">
                        <span>Sell Volume</span>
                        <strong id="coin-sell-volume">--</strong>
                    </div>

                    <div class="coin-flow-card">
                        <span>Buys</span>
                        <strong id="coin-buys">--</strong>
                    </div>

                    <div class="coin-flow-card">
                        <span>Sells</span>
                        <strong id="coin-sells">--</strong>
                    </div>

                    <div class="coin-flow-card">
                        <span>Traders</span>
                        <strong id="coin-traders">--</strong>
                    </div>

                    <div class="coin-flow-card">
                        <span>Net Buyers</span>
                        <strong id="coin-net-buyers">--</strong>
                    </div>

                </div>

            </section>


            <!-- =================================================
                 AUDIT
                 ================================================= -->

            <section class="coin-section">

                <div class="coin-section-title">
                    Audit & Security
                </div>

                <div class="coin-audit-grid">

                    <div class="coin-audit-item">
                        <span>Mint Authority</span>
                        <strong id="audit-mint">--</strong>
                    </div>

                    <div class="coin-audit-item">
                        <span>Freeze Authority</span>
                        <strong id="audit-freeze">--</strong>
                    </div>

                    <div class="coin-audit-item">
                        <span>Top Holders</span>
                        <strong id="audit-top-holders">--</strong>
                        <i id="audit-top-holders-meter" class="coin-meter" style="--pct: 0"></i>
                    </div>

                    <div class="coin-audit-item">
                        <span>Dev Balance</span>
                        <strong id="audit-dev-balance">--</strong>
                        <i id="audit-dev-balance-meter" class="coin-meter" style="--pct: 0"></i>
                    </div>

                    <div class="coin-audit-item">
                        <span>Dev Migrations</span>
                        <strong id="audit-migrations">--</strong>
                    </div>

                    <div class="coin-audit-item">
                        <span>Dev Mints</span>
                        <strong id="audit-mints">--</strong>
                    </div>

                </div>

            </section>


            <!-- =================================================
                 PROJECT INFO
                 ================================================= -->

            <section class="coin-section">

                <div class="coin-section-title">
                    Project Information
                </div>

                <div class="coin-project-grid">

                    <div class="coin-project-item">
                        <span>Token Program</span>
                        <strong id="coin-program">--</strong>
                    </div>

                    <div class="coin-project-item">
                        <span>Launchpad</span>
                        <strong id="coin-launchpad-detail">--</strong>
                    </div>

                    <div class="coin-project-item">
                        <span>First Pool</span>
                        <strong id="coin-first-pool">--</strong>
                    </div>

                    <div class="coin-project-item">
                        <span>Graduated Pool</span>
                        <strong id="coin-graduated-pool">--</strong>
                    </div>

                    <div class="coin-project-item">
                        <span>Created</span>
                        <strong id="coin-created">--</strong>
                    </div>

                    <div class="coin-project-item">
                        <span>Updated</span>
                        <strong id="coin-updated">--</strong>
                    </div>

                </div>

            </section>


            <!-- =================================================
                 SOCIAL
                 ================================================= -->

            <section class="coin-section">

                <div class="coin-section-title">
                    Community
                </div>

                <div
                    id="coin-socials"
                    class="coin-socials"
                ></div>

            </section>


            <div
                id="coin-status"
                class="coin-status"
            >
                Loading market data...
            </div>

        </main>

    `;

})();