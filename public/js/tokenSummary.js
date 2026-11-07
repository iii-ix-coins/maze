'use strict';

(function initTokenSummary() {

    const root =
        document.querySelector(
            '.token-summary'
        );

    if (!root) {
        return;
    }

    const REFRESH_INTERVAL = 30000;

    let requestController = null;
    let requestSequence = 0;

    const icon =
        document.getElementById(
            'token-summary-icon'
        );

    const name =
        document.getElementById(
            'token-summary-name'
        );

    const symbol =
        document.getElementById(
            'token-summary-symbol'
        );

    const verified =
        document.getElementById(
            'token-summary-verified'
        );

    function normalizeImageUrl(value) {

        const text =
            String(value ?? '').trim();

        if (!text) {
            return '';
        }

        return text.replace(
            /^https?:\/\//i,
            match => match.toLowerCase()
        );
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

    function formatScore(value) {

        const number =
            Number(value);

        if (!Number.isFinite(number)) {
            return '--';
        }

        return number.toFixed(2);
    }

    function updateValue(
        key,
        value
    ) {

        const element =
            root.querySelector(
                `[data-market="${key}"]`
            );

        if (!element) {
            return;
        }

        element.textContent =
            value;
    }

    async function loadMarketData() {

        const currentRequest =
            ++requestSequence;

        if (requestController) {
            requestController.abort();
        }

        const controller =
            new AbortController();

        requestController =
            controller;

        try {

            const response =
                await fetch(
                    '/api/jupiter-market',
                    {
                        method: 'GET',
                        cache: 'no-store',
                        headers: {
                            Accept:
                                'application/json'
                        },
                        signal:
                            controller.signal
                    }
                );

            if (!response.ok) {
                throw new Error(
                    `Market request failed: ${response.status}`
                );
            }

            const payload =
                await response.json();

            if (
                currentRequest !==
                requestSequence
            ) {
                return;
            }

            const market =
                payload?.data ||
                payload;

            const token =
                market?.tokenV2;

            const stats24h =
                token?.stats24h;

            if (!token) {
                return;
            }

            const buyVolume =
                Number(
                    stats24h?.buyVolume
                ) || 0;

            const sellVolume =
                Number(
                    stats24h?.sellVolume
                ) || 0;

            const volume24h =
                buyVolume +
                sellVolume;

            if (token.name) {
                name.textContent =
                    token.name;
            }

            if (token.symbol) {
                symbol.textContent =
                    `$${token.symbol}`;
            }

            const imageUrl =
                normalizeImageUrl(
                    token.icon
                );

            if (imageUrl) {
                icon.src =
                    imageUrl;
            }

            if (
                token.isVerified === true
            ) {
                verified.hidden = false;
            } else {
                verified.hidden = true;
            }

            updateValue(
                'mcap',
                formatUsd(token.mcap)
            );

            updateValue(
                'liquidity',
                formatUsd(token.liquidity)
            );

            updateValue(
                'volume24h',
                formatUsd(volume24h)
            );

            updateValue(
                'holders',
                formatInteger(token.holderCount)
            );

            updateValue(
                'organic',
                formatScore(token.organicScore)
            );

            updateValue(
                'netBuyers',
                formatInteger(
                    stats24h?.numNetBuyers
                )
            );

        } catch (error) {

            if (
                error?.name ===
                'AbortError'
            ) {
                return;
            }

            console.error(
                '[TokenSummary]',
                error
            );

        } finally {

            if (
                currentRequest ===
                requestSequence
            ) {
                requestController =
                    null;
            }
        }
    }

    loadMarketData();

    const timer =
        window.setInterval(
            loadMarketData,
            REFRESH_INTERVAL
        );

    window.addEventListener(
        'beforeunload',
        () => {

            clearInterval(timer);

            if (requestController) {
                requestController.abort();
            }

        },
        {
            once: true
        }
    );

})();