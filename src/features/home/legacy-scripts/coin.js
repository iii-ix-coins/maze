'use strict';

(function initCoinPage() {

    const page =
        document.querySelector(
            '.coin-page'
        );

    if (!page) {
        return;
    }

    const PERIODS = [
        ['5m', '5m'],
        ['1h', '1h'],
        ['6h', '6h'],
        ['24h', '24h']
    ];

    function setText(
        id,
        value
    ) {

        const element =
            document.getElementById(
                id
            );

        if (element) {
            element.textContent =
                value;
        }
    }

    function formatUsd(value) {

        return window.HollldNumberFormatter
            ? window.HollldNumberFormatter.usd(value)
            : '--';
    }

    function formatInteger(value) {

        return window.HollldNumberFormatter
            ? window.HollldNumberFormatter.integer(value)
            : '--';
    }

    function formatAmount(value) {

        return window.HollldNumberFormatter
            ? window.HollldNumberFormatter.amount(value)
            : '--';
    }

    function formatPrice(value) {

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

    function formatPercent(
        value
    ) {

        const number =
            Number(value);

        if (!Number.isFinite(number)) {
            return '--';
        }

        const sign =
            number >= 0
                ? '+'
                : '';

        return `${sign}${number.toFixed(2)}%`;
    }

    function normalizeUrl(value) {

        let text =
            String(
                value ?? ''
            ).trim();

        if (!text) {
            return '';
        }

        /*
         * Supports markdown-style raw values too.
         */
        const markdownMatch =
            text.match(
                /^\[.*?\]\((https?:\/\/.*?)\)$/
            );

        if (markdownMatch) {
            text =
                markdownMatch[1];
        }

        if (
            !/^https?:\/\//i.test(text)
        ) {
            text =
                `https://${text}`;
        }

        return text;
    }

    function normalizeIcon(
        value
    ) {

        const url =
            String(
                value ?? ''
            ).trim();

        if (!url) {
            return '';
        }

        return url.replace(
            /^https?:\/\//i,
            match => match.toLowerCase()
        );
    }

    function getVolume(
        stats
    ) {

        const buy =
            Number(
                stats?.buyVolume
            ) || 0;

        const sell =
            Number(
                stats?.sellVolume
            ) || 0;

        return buy + sell;
    }

    function createStatus(
        text,
        type = 'ready'
    ) {

        const status =
            document.getElementById(
                'coin-status'
            );

        if (!status) {
            return;
        }

        status.dataset.status =
            type;

        status.textContent =
            text;
    }

    function renderPeriods(
        token
    ) {

        const container =
            document.getElementById(
                'coin-period-grid'
            );

        if (!container) {
            return;
        }

        container.replaceChildren();

        for (
            const [
                key,
                label
            ] of PERIODS
        ) {

            const stats =
                token?.[`stats${key}`];

            const card =
                document.createElement(
                    'article'
                );

            card.className =
                'coin-period-card';

            const priceChange =
                Number(
                    stats?.priceChange
                );

            if (
                Number.isFinite(
                    priceChange
                )
            ) {
                card.dataset.direction =
                    priceChange >= 0
                        ? 'gain'
                        : 'loss';
            }

            card.innerHTML = `
                <div class="coin-period-head">
                    <span>${label}</span>
                    <strong>
                        ${formatPercent(
                            stats?.priceChange
                        )}
                    </strong>
                </div>

                <div class="coin-period-row">
                    <span>Volume</span>
                    <strong>
                        ${formatUsd(
                            getVolume(stats)
                        )}
                    </strong>
                </div>

                <div class="coin-period-row">
                    <span>Volume Δ</span>
                    <strong>
                        ${formatPercent(
                            stats?.volumeChange
                        )}
                    </strong>
                </div>

                <div class="coin-period-row">
                    <span>Liquidity Δ</span>
                    <strong>
                        ${formatPercent(
                            stats?.liquidityChange
                        )}
                    </strong>
                </div>

                <div class="coin-period-row">
                    <span>Holders Δ</span>
                    <strong>
                        ${formatPercent(
                            stats?.holderChange
                        )}
                    </strong>
                </div>

                <div class="coin-period-footer">
                    <span>
                        ${formatInteger(
                            stats?.numBuys
                        )} buys
                    </span>

                    <span>
                        ${formatInteger(
                            stats?.numSells
                        )} sells
                    </span>

                    <span>
                        ${formatInteger(
                            stats?.numTraders
                        )} traders
                    </span>
                </div>
            `;

            container.appendChild(
                card
            );
        }
    }

    function renderSocials(
        token
    ) {

        const container =
            document.getElementById(
                'coin-socials'
            );

        if (!container) {
            return;
        }

        container.replaceChildren();

        const links = [
            {
                label: 'Website',
                value: token?.website
            },
            {
                label: 'X',
                value: token?.twitter
            },
            {
                label: 'Telegram',
                value: token?.telegram
            }
        ];

        let hasLink = false;

        for (
            const item of links
        ) {

            const href =
                normalizeUrl(
                    item.value
                );

            if (!href) {
                continue;
            }

            hasLink = true;

            const link =
                document.createElement(
                    'a'
                );

            link.href =
                href;

            link.target =
                '_blank';

            link.rel =
                'noopener noreferrer';

            link.className =
                'coin-social-link';

            link.textContent =
                item.label;

            container.appendChild(
                link
            );
        }

        if (!hasLink) {

            const empty =
                document.createElement(
                    'span'
                );

            empty.className =
                'coin-social-empty';

            empty.textContent =
                'No public links available.';

            container.appendChild(
                empty
            );
        }
    }

    /* ---------------------------------------------------------
       Visual-state helpers (drive the CSS custom properties that
       css/coin-style.css reads: --score, --buy, --pct, data-tone)
       --------------------------------------------------------- */

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function renderScore(value) {

        const ring =
            document.getElementById(
                'coin-score'
            );

        if (!ring) {
            return;
        }

        const score =
            Number(value);

        if (!Number.isFinite(score)) {
            ring.style.setProperty('--score', '0');
            ring.removeAttribute('data-level');
            setText('coin-score-value', '--');
            return;
        }

        const level =
            score >= 70
                ? 'high'
                : score >= 40
                    ? 'mid'
                    : 'low';

        ring.dataset.level =
            level;

        ring.setAttribute(
            'aria-label',
            `Organic score ${score.toFixed(2)} out of 100`
        );

        setText(
            'coin-score-value',
            String(Math.round(score))
        );

        ring.style.setProperty(
            '--score',
            clamp(score, 0, 100).toFixed(2)
        );
    }

    function renderFlowMeter(stats) {

        const meter =
            document.getElementById(
                'coin-flow-meter'
            );

        if (!meter) {
            return;
        }

        const buy =
            Number(stats?.buyVolume) || 0;

        const sell =
            Number(stats?.sellVolume) || 0;

        const total =
            buy + sell;

        if (total <= 0) {
            meter.style.setProperty('--buy', '50');
            meter.dataset.lean = 'even';
            setText('coin-flow-meter-lean', '--');
            setText('coin-flow-meter-buy', 'Buy --');
            setText('coin-flow-meter-sell', 'Sell --');
            return;
        }

        const buyShare =
            (buy / total) * 100;

        meter.style.setProperty(
            '--buy',
            buyShare.toFixed(2)
        );

        meter.dataset.lean =
            buyShare >= 52
                ? 'buy'
                : buyShare <= 48
                    ? 'sell'
                    : 'even';

        setText(
            'coin-flow-meter-lean',
            buyShare >= 52
                ? `Buyers lead · ${buyShare.toFixed(1)}%`
                : buyShare <= 48
                    ? `Sellers lead · ${(100 - buyShare).toFixed(1)}%`
                    : 'Balanced'
        );

        setText(
            'coin-flow-meter-buy',
            `Buy ${formatUsd(buy)} · ${buyShare.toFixed(1)}%`
        );

        setText(
            'coin-flow-meter-sell',
            `${(100 - buyShare).toFixed(1)}% · ${formatUsd(sell)} Sell`
        );
    }

    function renderAuditVisuals(audit) {

        const tone = (id, value) => {
            const item =
                document.getElementById(id)
                    ?.closest('.coin-audit-item');

            const label =
                document.getElementById(id);

            if (label) {
                if (value) {
                    label.dataset.tone = value;
                } else {
                    delete label.dataset.tone;
                }
            }

            if (item) {
                if (value === 'bad' || value === 'warn') {
                    item.dataset.tone = value;
                } else {
                    delete item.dataset.tone;
                }
            }
        };

        tone(
            'audit-mint',
            audit.mintAuthorityDisabled === true ? 'good' : 'bad'
        );

        tone(
            'audit-freeze',
            audit.freezeAuthorityDisabled === true ? 'good' : 'bad'
        );

        const meter = (id, raw, warnAt, badAt) => {
            const el =
                document.getElementById(id);

            if (!el) {
                return;
            }

            const pct =
                Number(raw);

            if (!Number.isFinite(pct)) {
                el.style.setProperty('--pct', '0');
                return;
            }

            el.style.setProperty(
                '--pct',
                clamp(pct, 0, 100).toFixed(2)
            );

            const item =
                el.closest('.coin-audit-item');

            if (!item) {
                return;
            }

            if (pct >= badAt) {
                item.dataset.tone = 'bad';
            } else if (pct >= warnAt) {
                item.dataset.tone = 'warn';
            } else {
                delete item.dataset.tone;
            }
        };

        meter('audit-top-holders-meter', audit.topHoldersPercentage, 35, 60);
        meter('audit-dev-balance-meter', audit.devBalancePercentage, 5, 20);
    }

    function renderMarket(
        payload
    ) {

        const market =
            payload?.data ||
            payload;

        const token =
            market?.tokenV2;

        if (!token) {
            throw new Error(
                'Token market data is unavailable.'
            );
        }

        const stats24h =
            token.stats24h;

        const audit =
            token.audit || {};

        const firstPool =
            token.firstPool || {};

        /*
         * Hero
         */

        const icon =
            document.getElementById(
                'coin-icon'
            );

        const iconUrl =
            normalizeIcon(
                token.icon
            );

        if (
            icon &&
            iconUrl
        ) {
            icon.src =
                iconUrl;
        }

        setText(
            'coin-name',
            token.name || '--'
        );

        setText(
            'coin-symbol',
            token.symbol
                ? `$${token.symbol}`
                : '--'
        );

        const verified =
            document.getElementById(
                'coin-verified'
            );

        if (verified) {
            verified.hidden =
                token.isVerified !== true;
        }

        setText(
            'coin-launchpad',
            token.launchpad || 'Token'
        );

        setText(
            'coin-organic-score',
            Number.isFinite(
                Number(token.organicScore)
            )
                ? `Organic ${Number(
                    token.organicScore
                ).toFixed(2)}`
                : 'Organic --'
        );

        renderScore(
            token.organicScore
        );

        setText(
            'coin-mint',
            market.mintAddress || '--'
        );

        /*
         * Overview
         */

        setText(
            'coin-price',
            formatPrice(
                token.usdPrice
            )
        );

        setText(
            'coin-price-change',
            formatPercent(
                stats24h?.priceChange
            )
        );

        setText(
            'coin-mcap',
            formatUsd(
                token.mcap
            )
        );

        setText(
            'coin-fdv',
            formatUsd(
                token.fdv
            )
        );

        setText(
            'coin-liquidity',
            formatUsd(
                token.liquidity
            )
        );

        setText(
            'coin-holders',
            formatInteger(
                token.holderCount
            )
        );

        setText(
            'coin-circ-supply',
            formatAmount(
                token.circSupply
            )
        );

        setText(
            'coin-total-supply',
            formatAmount(
                token.totalSupply
            )
        );

        /*
         * Trading flow
         */

        setText(
            'coin-buy-volume',
            formatUsd(
                stats24h?.buyVolume
            )
        );

        setText(
            'coin-sell-volume',
            formatUsd(
                stats24h?.sellVolume
            )
        );

        setText(
            'coin-buys',
            formatInteger(
                stats24h?.numBuys
            )
        );

        setText(
            'coin-sells',
            formatInteger(
                stats24h?.numSells
            )
        );

        setText(
            'coin-traders',
            formatInteger(
                stats24h?.numTraders
            )
        );

        setText(
            'coin-net-buyers',
            formatInteger(
                stats24h?.numNetBuyers
            )
        );

        renderFlowMeter(
            stats24h
        );

        /*
         * Audit
         */

        setText(
            'audit-mint',
            audit.mintAuthorityDisabled === true
                ? 'Disabled'
                : 'Active'
        );

        setText(
            'audit-freeze',
            audit.freezeAuthorityDisabled === true
                ? 'Disabled'
                : 'Active'
        );

        setText(
            'audit-top-holders',
            Number.isFinite(
                Number(
                    audit.topHoldersPercentage
                )
            )
                ? `${Number(
                    audit.topHoldersPercentage
                ).toFixed(2)}%`
                : '--'
        );

        setText(
            'audit-dev-balance',
            Number.isFinite(
                Number(
                    audit.devBalancePercentage
                )
            )
                ? `${Number(
                    audit.devBalancePercentage
                ).toFixed(8)}%`
                : '--'
        );

        setText(
            'audit-migrations',
            formatInteger(
                audit.devMigrations
            )
        );

        setText(
            'audit-mints',
            formatInteger(
                audit.devMints
            )
        );

        renderAuditVisuals(
            audit
        );

        /*
         * Project
         */

        setText(
            'coin-program',
            token.tokenProgram || '--'
        );

        setText(
            'coin-launchpad-detail',
            token.launchpad || '--'
        );

        setText(
            'coin-first-pool',
            firstPool.id || '--'
        );

        setText(
            'coin-graduated-pool',
            token.graduatedPool || '--'
        );

        setText(
            'coin-created',
            token.createdAt || '--'
        );

        setText(
            'coin-updated',
            token.updatedAt || '--'
        );

        /*
         * Performance
         */

        renderPeriods(
            token
        );

        /*
         * Social
         */

        renderSocials(
            token
        );

        /*
         * Status
         */

        createStatus(
            payload?.updatedAt
                ? `Updated ${payload.updatedAt}`
                : 'Market data ready',
            'ready'
        );
    }

    async function loadMarketData() {

        try {

            createStatus(
                'Loading market data...',
                'loading'
            );

            const response =
                await fetch(
                    '/api/jupiter-market',
                    {
                        method: 'GET',
                        cache: 'no-store',
                        headers: {
                            Accept:
                                'application/json'
                        }
                    }
                );

            if (!response.ok) {
                throw new Error(
                    `HTTP ${response.status}`
                );
            }

            const payload =
                await response.json();

            renderMarket(
                payload
            );

        } catch (error) {

            console.error(
                '[Coin]',
                error
            );

            createStatus(
                'Market data temporarily unavailable.',
                'error'
            );
        }
    }

    loadMarketData();

    const timer =
        window.setInterval(
            loadMarketData,
            30000
        );

    window.addEventListener(
        'beforeunload',
        () => {
            clearInterval(timer);
        },
        {
            once: true
        }
    );

})();