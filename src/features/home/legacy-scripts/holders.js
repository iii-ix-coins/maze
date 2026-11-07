(() => {
    'use strict';

    /* =========================================================
       CONFIG
       ========================================================= */

    const FEED_LIMIT = 100;
    const REFRESH_INTERVAL = 5000;

    /* =========================================================
       DOM
       ========================================================= */

    const listElement =
        document.getElementById(
            'holders-list'
        );

    const countElement =
        document.getElementById(
            'holders-count'
        );

    /* =========================================================
       GUARD
       ========================================================= */

    if (
        !listElement ||
        !countElement
    ) {
        console.error(
            'Holders UI elements were not found.'
        );

        return;
    }

    /* =========================================================
       STATE
       ========================================================= */

    let refreshTimer = null;
    let requestController = null;
    let requestSequence = 0;

    let lastDataVersion = null;
    let hasRenderedData = false;

    /* =========================================================
       HELPERS
       ========================================================= */

    function shortWallet(
        wallet
    ) {
        if (
            !wallet ||
            typeof wallet !== 'string'
        ) {
            return '--';
        }

        if (
            wallet.length < 12
        ) {
            return wallet;
        }

        return `${wallet.slice(0, 5)}...${wallet.slice(-5)}`;
    }

    function formatAmount(
        value
    ) {
        const amount =
            Number(value);

        if (
            !Number.isFinite(
                amount
            )
        ) {
            return '--';
        }

        if (
            amount >= 1_000_000_000
        ) {
            return `${(
                amount / 1_000_000_000
            ).toFixed(2)}B`;
        }

        if (
            amount >= 1_000_000
        ) {
            return `${(
                amount / 1_000_000
            ).toFixed(2)}M`;
        }

        if (
            amount >= 1_000
        ) {
            return `${(
                amount / 1_000
            ).toFixed(2)}K`;
        }

        return amount.toLocaleString(
            'en-US',
            {
                maximumFractionDigits: 4
            }
        );
    }

    function formatRelativeTime(
        blockTime
    ) {
        if (
            blockTime == null
        ) {
            return 'Never';
        }

        const secondsValue =
            Number(blockTime);

        if (
            !Number.isFinite(
                secondsValue
            )
        ) {
            return '--';
        }

        const timestampMs =
            secondsValue * 1000;

        const difference =
            Date.now() -
            timestampMs;

        if (
            difference < 0
        ) {
            return 'Just now';
        }

        const seconds =
            Math.floor(
                difference / 1000
            );

        if (
            seconds < 60
        ) {
            return `${seconds}s ago`;
        }

        const minutes =
            Math.floor(
                seconds / 60
            );

        if (
            minutes < 60
        ) {
            return `${minutes}m ago`;
        }

        const hours =
            Math.floor(
                minutes / 60
            );

        if (
            hours < 24
        ) {
            return `${hours}h ago`;
        }

        const days =
            Math.floor(
                hours / 24
            );

        return `${days}d ago`;
    }

    /* =========================================================
       DATA VERSION
       *
       * Snapshot timestamp alone is NOT enough.
       *
       * Purchases may change while holder snapshot
       * remains unchanged.
       * ========================================================= */

    function createDataVersion(
        data,
        items
    ) {
        const snapshot =
            data?.snapshotTimestamp ||
            '';

        const itemState =
            items
                .map(
                    item => [
                        item.rank ?? '',
                        item.wallet ?? '',
                        item.uiAmount ?? '',
                        item.purchases ?? 0,
                        item.lastPurchaseBlockTime ?? ''
                    ].join(':')
                )
                .join('|');

        return `${snapshot}::${itemState}`;
    }

    /* =========================================================
       ROW CREATION
       ========================================================= */

    function createHolderRow(
        holder
    ) {
        const row =
            document.createElement(
                'div'
            );

        row.className =
            'holders-row holder-row';

        row.dataset.wallet =
            holder.wallet || '';

        /* -------------------------
           Rank
           ------------------------- */

        const rank =
            document.createElement(
                'div'
            );

        rank.className =
            'holder-rank';

        const rankValue =
            document.createElement(
                'span'
            );

        rankValue.className =
            'holder-rank-value';

        rank.appendChild(
            rankValue
        );

        /* -------------------------
           Wallet
           ------------------------- */

        const wallet =
            document.createElement(
                'div'
            );

        wallet.className =
            'holder-wallet';

        const walletValue =
            document.createElement(
                'span'
            );

        walletValue.className =
            'wallet-address';

        wallet.appendChild(
            walletValue
        );

        /* -------------------------
           Amount
           ------------------------- */

        const amount =
            document.createElement(
                'div'
            );

        amount.className =
            'holder-amount';

        const amountValue =
            document.createElement(
                'span'
            );

        amountValue.className =
            'holder-amount-value';

        amount.appendChild(
            amountValue
        );

        /* -------------------------
           Purchases
           ------------------------- */

        const purchases =
            document.createElement(
                'div'
            );

        purchases.className =
            'holder-Purchases';

        const purchasesValue =
            document.createElement(
                'span'
            );

        purchasesValue.className =
            'holder-purchases-value';

        purchases.appendChild(
            purchasesValue
        );

        /* -------------------------
           Last Purchase
           ------------------------- */

        const lastPurchase =
            document.createElement(
                'div'
            );

        lastPurchase.className =
            'holder-last-Purchases';

        const lastPurchaseValue =
            document.createElement(
                'span'
            );

        lastPurchaseValue.className =
            'holder-last-Purchases-value';

        lastPurchase.appendChild(
            lastPurchaseValue
        );

        /* -------------------------
           Assemble
           ------------------------- */

        row.append(
            rank,
            wallet,
            amount,
            purchases,
            lastPurchase
        );

        updateHolderRow(
            row,
            holder
        );

        return row;
    }

    /* =========================================================
       ROW UPDATE
       ========================================================= */

    function updateHolderRow(
        row,
        holder
    ) {
        if (
            !row ||
            !holder
        ) {
            return;
        }

        row.dataset.wallet =
            holder.wallet || '';

        const rankValue =
            row.querySelector(
                '.holder-rank-value'
            );

        const walletValue =
            row.querySelector(
                '.wallet-address'
            );

        const amountValue =
            row.querySelector(
                '.holder-amount-value'
            );

        const purchasesValue =
            row.querySelector(
                '.holder-purchases-value'
            );

        const lastPurchaseValue =
            row.querySelector(
                '.holder-last-Purchases-value'
            );

        if (rankValue) {
            rankValue.textContent =
                holder.rank ?? '--';
        }

        if (walletValue) {
            walletValue.title =
                holder.wallet || '';

            walletValue.textContent =
                shortWallet(
                    holder.wallet
                );
        }

        if (amountValue) {
            amountValue.textContent =
                formatAmount(
                    holder.uiAmount
                );
        }

        if (purchasesValue) {
            const purchases =
                Number(
                    holder.purchases
                );

            purchasesValue.textContent =
                Number.isFinite(
                    purchases
                )
                    ? purchases.toLocaleString(
                        'en-US'
                    )
                    : '0';
        }

        if (lastPurchaseValue) {
            lastPurchaseValue.textContent =
                formatRelativeTime(
                    holder.lastPurchaseBlockTime
                );
        }
    }

    /* =========================================================
       ROW VISUALS
       *
       * css/holders-style.css reads two custom properties per row:
       *   --heat  0..1   wealth bar, log-scaled between the smallest
       *                  and the largest holder of the current list
       *   --hue   0..359 generative wallet avatar colour (stable hash)
       * ========================================================= */

    function walletHue(
        wallet
    ) {
        let hash = 0;

        for (
            let index = 0;
            index < wallet.length;
            index += 1
        ) {
            hash =
                (
                    Math.imul(hash, 31) +
                    wallet.charCodeAt(index)
                ) | 0;
        }

        return Math.abs(hash) % 360;
    }

    function applyRowVisuals(
        entries
    ) {
        const amounts =
            entries
                .map(
                    ([, holder]) =>
                        Number(holder.uiAmount)
                )
                .filter(
                    value =>
                        Number.isFinite(value) &&
                        value > 0
                );

        const max =
            amounts.length
                ? Math.max(...amounts)
                : 0;

        const min =
            amounts.length
                ? Math.min(...amounts)
                : 0;

        const span =
            max > min
                ? Math.log(max) - Math.log(min)
                : 0;

        for (
            const [row, holder] of entries
        ) {
            const amount =
                Number(holder.uiAmount);

            let heat = 0;

            if (
                Number.isFinite(amount) &&
                amount > 0 &&
                max > 0
            ) {
                heat =
                    span > 0
                        ? (
                            Math.log(amount) -
                            Math.log(min)
                        ) / span
                        : 1;

                heat =
                    0.04 +
                    heat * 0.96;
            }

            row.style.setProperty(
                '--heat',
                heat.toFixed(3)
            );

            row.style.setProperty(
                '--hue',
                String(
                    walletHue(
                        holder.wallet
                    )
                )
            );
        }
    }

    /* =========================================================
       PATCH HOLDER LIST
       *
       * Reuse existing DOM rows whenever possible.
       * This avoids rebuilding all 100 rows unnecessarily.
       * ========================================================= */

    function renderHolders(
        items
    ) {
        const existingRows =
            new Map();

        listElement
            .querySelectorAll(
                '.holder-row'
            )
            .forEach(
                row => {
                    const wallet =
                        row.dataset.wallet;

                    if (
                        wallet
                    ) {
                        existingRows.set(
                            wallet,
                            row
                        );
                    }
                }
            );

        const fragment =
            document.createDocumentFragment();

        const activeWallets =
            new Set();

        const styled =
            [];

        for (
            const holder of items
        ) {
            if (
                !holder ||
                !holder.wallet
            ) {
                continue;
            }

            activeWallets.add(
                holder.wallet
            );

            let row =
                existingRows.get(
                    holder.wallet
                );

            if (!row) {
                row =
                    createHolderRow(
                        holder
                    );
            } else {
                updateHolderRow(
                    row,
                    holder
                );
            }

            styled.push(
                [row, holder]
            );

            fragment.appendChild(
                row
            );
        }

        applyRowVisuals(
            styled
        );

        listElement.replaceChildren(
            fragment
        );
    }

    /* =========================================================
       STATUS
       ========================================================= */

    function renderStatus(
        message,
        type = 'loading'
    ) {
        const status =
            document.createElement(
                'div'
            );

        status.className =
            `holders-status holders-status-${type}`;

        status.textContent =
            message;

        listElement.replaceChildren(
            status
        );
    }

    /* =========================================================
       LOAD HOLDERS
       ========================================================= */

    async function loadHolders() {
        const currentRequest =
            ++requestSequence;

        if (
            requestController
        ) {
            requestController.abort();
        }

        const controller =
            new AbortController();

        requestController =
            controller;

        /*
         * Only show loading state before
         * the first successful render.
         *
         * During normal refreshes, current
         * data remains visible.
         */
        if (
            !hasRenderedData
        ) {
            renderStatus(
                'Loading holders...',
                'loading'
            );
        }

        try {
            const response =
                await fetch(
                    `/api/live-feed/holders?limit=${FEED_LIMIT}`,
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

            if (
                !response.ok
            ) {
                throw new Error(
                    `Holder request failed with status ${response.status}`
                );
            }

            const data =
                await response.json();

            /*
             * Ignore stale requests.
             */
            if (
                currentRequest !==
                requestSequence
            ) {
                return;
            }

            /*
             * Validate response.
             */
            if (
                !data ||
                !Array.isArray(
                    data.items
                )
            ) {
                throw new Error(
                    'Invalid holders response.'
                );
            }

            const items =
                data.items
                    .slice(
                        0,
                        FEED_LIMIT
                    );

            /*
             * Empty result.
             */
            if (
                items.length === 0
            ) {
                renderStatus(
                    'No holder data available.',
                    'empty'
                );

                countElement.textContent =
                    '0';

                lastDataVersion =
                    null;

                hasRenderedData =
                    false;

                return;
            }

            /*
             * Detect real data changes.
             *
             * Includes:
             *   - holder snapshot
             *   - amount
             *   - purchase count
             *   - last purchase
             */
            const dataVersion =
                createDataVersion(
                    data,
                    items
                );

            /*
             * Skip unnecessary DOM work.
             */
            if (
                hasRenderedData &&
                dataVersion ===
                lastDataVersion
            ) {
                return;
            }

            /*
             * Render / patch rows.
             */
            renderHolders(
                items
            );

            /*
             * Total holder count.
             */
            const totalHolders =
                Number(
                    data.totalHolders
                );

            countElement.textContent =
                Number.isFinite(
                    totalHolders
                )
                    ? totalHolders.toLocaleString(
                        'en-US'
                    )
                    : items.length.toLocaleString(
                        'en-US'
                    );

            lastDataVersion =
                dataVersion;

            hasRenderedData =
                true;

        } catch (error) {
            if (
                error?.name ===
                'AbortError'
            ) {
                return;
            }

            console.error(
                'Failed to load holders:',
                error
            );

            /*
             * Do not destroy valid existing
             * data because of a temporary
             * refresh failure.
             */
            if (
                !hasRenderedData
            ) {
                renderStatus(
                    'Unable to load holder data.',
                    'error'
                );

                countElement.textContent =
                    '0';
            }

        } finally {
            /*
             * Clear controller only if this
             * is still the active request.
             */
            if (
                currentRequest ===
                requestSequence
            ) {
                requestController =
                    null;
            }
        }
    }

    /* =========================================================
       REFRESH
       ========================================================= */

    function scheduleRefresh() {
        if (
            refreshTimer
        ) {
            clearInterval(
                refreshTimer
            );
        }

        refreshTimer =
            setInterval(
                loadHolders,
                REFRESH_INTERVAL
            );
    }

    /* =========================================================
       CLEANUP
       ========================================================= */

    function cleanup() {
        if (
            refreshTimer
        ) {
            clearInterval(
                refreshTimer
            );

            refreshTimer =
                null;
        }

        if (
            requestController
        ) {
            requestController.abort();
            requestController =
                null;
        }
    }

    window.addEventListener(
        'beforeunload',
        cleanup,
        {
            once: true
        }
    );

    /* =========================================================
       INITIAL LOAD
       ========================================================= */

    loadHolders()
        .finally(
            scheduleRefresh
        );

})();