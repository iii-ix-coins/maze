'use strict';
(() => {
    /* =====================================================
       DOM
       ===================================================== */
    const panel =
        document.getElementById(
            'live-feed-panel'
        );
    const buttons =
        [
            ...document.querySelectorAll(
                '[data-live-feed]'
            )
        ];
    if (
        !panel ||
        buttons.length === 0
    ) {
        return;
    }
    /* =====================================================
       CONSTANTS
       ===================================================== */
    const FEED_LIMIT = 100;
    const REFRESH_INTERVAL = 5000;
    const FEED_SWITCH_DURATION = 280;
    const CARD_STAGGER_STEP = 8;
    const MAX_CARD_STAGGER = 80;
    /* =====================================================
       STATE
       ===================================================== */
    let activeFeed = 'buyers';
    let refreshTimer = null;
    let requestController = null;
    let requestSequence = 0;
    let feedSwitchSequence = 0;
    const lastVersion = {
        buyers: null,
        holders: null
    };
    /* =====================================================
       BASIC HELPERS
       ===================================================== */
    function shortWallet(wallet) {
        if (
            typeof wallet !== 'string' ||
            wallet.length < 12
        ) {
            return wallet || 'Unknown';
        }
        return (
            wallet.slice(0, 5) +
            '....' +
            wallet.slice(-4)
        );
    }
    /* =====================================================
       FEED KEYS
       ===================================================== */
    function getBuyerKey(item) {
        const signature =
            String(
                item?.signature ?? ''
            ).trim();
        if (signature) {
            return `buyer:${signature}`;
        }
        return [
            'buyer',
            item?.buyerWallet ?? '',
            item?.blockTime ?? '',
            item?.amountBought ?? ''
        ].join(':');
    }
    function getHolderKey(item) {
        const wallet =
            String(
                item?.wallet ?? ''
            ).trim();

        return `holder:${wallet}`;
    }
    /* =====================================================
       VERSIONING
       ===================================================== */
    function getFeedVersion(
        type,
        data
    ) {
        const items =
            Array.isArray(data?.items)
                ? data.items.slice(
                    0,
                    FEED_LIMIT
                )
                : [];
        if (type === 'holders') {
            return items
                .map(
                    item => [
                        item?.rank ?? '',
                        item?.wallet ?? '',
                        item?.rawAmount ?? '',
                        item?.uiAmount ?? '',
                        item?.state ?? '',
                        item?.lastUpdatedMs ?? '',
                        item?.lastSellAllTime ?? '',
                        item?.snapshotTimestamp ?? ''
                    ].join(':')
                )
                .join('|') || 'no-holders';
        }

        return items
            .map(
                item =>
                    `${item?.signature ?? ''}:${item?.blockTime ?? ''}`
            )
            .join('|') || 'no-buyers';
    }
    /* =====================================================
       RAIL
       ===================================================== */
    function ensureRail() {
        let rail =
            panel.querySelector(
                '.live-feed-rail-scroll'
            );
        if (!rail) {
            rail =
                document.createElement(
                    'div'
                );
            rail.className =
                'live-feed-rail-scroll';
            panel.replaceChildren(
                rail
            );
        }
        return rail;
    }
    /* =====================================================
       SCROLL STATE
       ===================================================== */
    function captureScrollState(
        rail
    ) {
        const scrollLeft =
            rail.scrollLeft;
        const railRect =
            rail.getBoundingClientRect();
        const children =
            [
                ...rail.children
            ];
        if (
            children.length === 0
        ) {
            return {
                scrollLeft,
                anchorKey: null,
                anchorOffset: 0
            };
        }
        const leftEdge =
            railRect.left + 2;
        let anchor = null;
        for (
            const child
            of children
        ) {
            const rect =
                child.getBoundingClientRect();
            if (
                rect.right > leftEdge
            ) {
                anchor = {
                    anchorKey:
                        child.dataset.feedKey ||
                        null,
                    anchorOffset:
                        rect.left -
                        railRect.left
                };
                break;
            }
        }
        return {
            scrollLeft,
            anchorKey:
                anchor?.anchorKey ||
                null,
            anchorOffset:
                anchor?.anchorOffset ||
                0
        };
    }
    function restoreScrollState(
        rail,
        state
    ) {
        if (
            !state
        ) {
            return;
        }
        const previousBehavior =
            rail.style.scrollBehavior;
        rail.style.scrollBehavior =
            'auto';
        if (
            state.anchorKey
        ) {
            const anchorCard =
                [
                    ...rail.children
                ]
                    .find(
                        child =>
                            child.dataset.feedKey ===
                            state.anchorKey
                    );
            if (
                anchorCard
            ) {
                const railRect =
                    rail.getBoundingClientRect();
                const cardRect =
                    anchorCard.getBoundingClientRect();
                const currentOffset =
                    cardRect.left -
                    railRect.left;
                const delta =
                    currentOffset -
                    state.anchorOffset;
                const targetScroll =
                    Math.max(
                        0,
                        state.scrollLeft +
                        delta
                    );
                rail.scrollLeft =
                    targetScroll;
                requestAnimationFrame(
                    () => {
                        rail.scrollLeft =
                            targetScroll;
                    }
                );
                requestAnimationFrame(
                    () => {

                        rail.style.scrollBehavior =
                            previousBehavior;
                    }
                );
                return;
            }
        }
        const maxScroll =
            Math.max(
                0,
                rail.scrollWidth -
                rail.clientWidth
            );
        rail.scrollLeft =
            Math.min(
                state.scrollLeft,
                maxScroll
            );
        requestAnimationFrame(
            () => {
                rail.style.scrollBehavior =
                    previousBehavior;
            }
        );
    }
    /* =====================================================
       CARD ANIMATION
       ===================================================== */
    function animateNewCards(
        cards
    ) {
        if (
            !Array.isArray(cards) ||
            cards.length === 0
        ) {
            return;
        }
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                cards.forEach(
                    (card, index) => {
                        if (!card) {
                            return;
                        }
                        const delay =
                            Math.min(
                                index *
                                CARD_STAGGER_STEP,
                                MAX_CARD_STAGGER
                            );
                        card.style.transitionDelay =
                            `${delay}ms`;
                        card.classList.remove(
                            'is-entering'
                        );
                        card.classList.add(
                            'is-visible'
                        );
                        window.setTimeout(
                            () => {
                                card.style.transitionDelay =
                                    '';
                            },
                            350 + delay
                        );
                    }
                );
            });
        });
    }
    /* =====================================================
       BUYER CARD
       ===================================================== */
    function createBuyerCard(
        item
    ) {
        const card =
            document.createElement(
                'article'
            );
        card.className =
            'live-card is-entering';

        card.dataset.feedKey =
            getBuyerKey(item);
        card.dataset.signature =
            item?.signature || '';
        card.dataset.wallet =
            item?.buyerWallet || '';
        card.innerHTML = `
            <button
                class="live-card-vote"
                type="button"
            >
                +VOTE
            </button>
            <div
                class="live-card-wallet"
                data-role="wallet"
            ></div>
            <div
                class="live-card-line"
                data-role="bought"
            ></div>
            <div
                class="live-card-footer"
            >
                <button
                    class="live-card-action like"
                    type="button"
                    aria-label="Like"
                >
                    <img
                        src="./css/images/like-logo.svg"
                        alt="Likes"
                    >
                </button>
                <button
                    class="live-card-action view"
                    type="button"
                    aria-label="View transaction"
                >
                    <img
                        src="./css/images/view-logo.svg"
                        alt="Views"
                    >
                </button>

            </div>
        `;
        updateBuyerCard(
            card,
            item
        );
        return card;
    }
    function updateBuyerCard(
        card,
        item
    ) {
        card.dataset.signature =
            item?.signature || '';
        card.dataset.wallet =
            item?.buyerWallet || '';
        card.dataset.feedKey =
            getBuyerKey(item);
        const wallet =
            card.querySelector(
                '[data-role="wallet"]'
            );
        const bought =
            card.querySelector(
                '[data-role="bought"]'
            );
        if (wallet) {
            wallet.textContent =
                shortWallet(
                    item?.buyerWallet
                );
        }
        if (bought) {
            bought.textContent =
                `${window.HollldNumberFormatter.amount(
                    item?.amountBought
                )} Hold`;
        }
    }
    /* =====================================================
       HOLDER CARD
       ===================================================== */
    function createHolderCard(
        item
    ) {
        const card =
            document.createElement(
                'article'
            );
        card.className =
            'live-card is-entering';
        card.dataset.feedKey =
            getHolderKey(item);
        card.dataset.wallet =
            item?.wallet || '';
        card.innerHTML = `
            <div class="holder-card-top">
                <div
                    class="live-card-rank"
                    data-role="rank"
                ></div>
                <button
                    class="holder-live-card-vote"
                    type="button"
                >
                    +VOTE
                </button>
            </div>
            <div
                class="live-card-wallet"
                data-role="wallet"
            ></div>
            <div
                class="live-card-line"
                data-role="hold"
            ></div>
            <div
                class="live-card-footer"
            >
                <button
                    class="live-card-action like"
                    type="button"
                    aria-label="Like"
                >
                    <img
                        src="./css/images/like-logo.svg"
                        alt="Likes"
                    >
                </button>
                <button
                    class="live-card-action view"
                    type="button"
                    aria-label="View wallet"
                >
                    <img
                        src="./css/images/view-logo.svg"
                        alt="Views"
                    >
                </button>
            </div>
        `;
        updateHolderCard(
            card,
            item
        );
        return card;
    }
    function updateHolderCard(
        card,
        item
    ) {
        card.dataset.wallet =
            item?.wallet || '';
        card.dataset.feedKey =
            getHolderKey(item);
        const rank =
            card.querySelector(
                '[data-role="rank"]'
            );
        const wallet =
            card.querySelector(
                '[data-role="wallet"]'
            );
        const hold =
            card.querySelector(
                '[data-role="hold"]'
            );
        if (rank) {
            rank.textContent =
                `${item?.rank ?? '--'}`;
        }
        if (wallet) {
            wallet.textContent =
                shortWallet(
                    item?.wallet
                );
        }
        if (hold) {
            hold.textContent =
                window.HollldNumberFormatter.amount(
                    item?.uiAmount
                );
        }
    }
    /* =====================================================
       RECONCILIATION
       ===================================================== */
    function patchRail(
        type,
        items,
        options = {}
    ) {
        const {
            preserveScroll = true
        } = options;
        const rail =
            ensureRail();
        for (
            const child
            of [
                ...rail.children
            ]
        ) {
            if (
                !child.classList.contains(
                    'live-card'
                )
            ) {
                child.remove();
            }
        }
        const scrollState =
            preserveScroll
                ? captureScrollState(rail)
                : null;
        const existing =
            new Map();
        for (
            const card
            of rail.children
        ) {
            const key =
                card.dataset.feedKey;
            if (key) {
                existing.set(
                    key,
                    card
                );
            }
        }
        const nextKeys =
            new Set();
        const newCards = [];
        let cursor =
            rail.firstElementChild;
        items.forEach(
            item => {
                const key =
                    type === 'buyers'
                        ? getBuyerKey(item)
                        : getHolderKey(item);
                nextKeys.add(
                    key
                );
                let card =
                    existing.get(key);
                if (!card) {
                    card =
                        type === 'buyers'
                            ? createBuyerCard(item)
                            : createHolderCard(item);
                    newCards.push(
                        card
                    );
                }
                else {
                    if (
                        type === 'buyers'
                    ) {
                        updateBuyerCard(
                            card,
                            item
                        );
                    } else {
                        updateHolderCard(
                            card,
                            item
                        );
                    }
                }
                if (
                    card !== cursor
                ) {
                    rail.insertBefore(
                        card,
                        cursor
                    );
                }
                cursor =
                    card.nextElementSibling;
            }
        );
        for (
            const [
                key,
                card
            ]
            of existing.entries()
        ) {
            if (
                !nextKeys.has(key)
            ) {
                card.remove();
            }
        }
        /* -------------------------------------------------
           SCROLL
           ------------------------------------------------- */
        if (
            preserveScroll
        ) {
            restoreScrollState(
                rail,
                scrollState
            );
        } else {
            rail.scrollLeft = 0;
        }
        /* -------------------------------------------------
           NEW CARD ANIMATION
           ------------------------------------------------- */
        animateNewCards(
            newCards
        );
    }
    /* =====================================================
       FEED SWITCH
       ===================================================== */
    function switchFeedContent(
        renderContent
    ) {
        const rail =
            ensureRail();
        const sequence =
            ++feedSwitchSequence;
        return new Promise(
            resolve => {
                let finished = false;
                let fallbackTimer = null;
                const cleanup = () => {
                    rail.removeEventListener(
                        'transitionend',
                        handleTransitionEnd
                    );
                    if (
                        fallbackTimer
                    ) {
                        window.clearTimeout(
                            fallbackTimer
                        );
                    }
                };
                const finish = () => {
                    if (finished) {
                        return;
                    }
                    finished = true;
                    cleanup();
                    if (
                        sequence !==
                        feedSwitchSequence
                    ) {
                        resolve(false);
                        return;
                    }
                    renderContent();
                    rail.scrollLeft = 0;
                    void rail.offsetWidth;
                    rail.classList.remove(
                        'is-switching-out'
                    );
                    rail.classList.add(
                        'is-switching-in'
                    );
                    requestAnimationFrame(
                        () => {
                            if (
                                sequence !==
                                feedSwitchSequence
                            ) {
                                resolve(false);
                                return;
                            }
                            rail.classList.remove(
                                'is-switching-in'
                            );
                            resolve(true);
                        }
                    );
                };
                const handleTransitionEnd =
                    event => {
                        if (
                            event.target !== rail ||
                            event.propertyName !== 'opacity'
                        ) {
                            return;
                        }
                        finish();
                    };
                fallbackTimer =
                    window.setTimeout(
                        finish,
                        FEED_SWITCH_DURATION + 50
                    );
                rail.classList.remove(
                    'is-switching-in'
                );
                void rail.offsetWidth;
                rail.addEventListener(
                    'transitionend',
                    handleTransitionEnd
                );
                rail.classList.add(
                    'is-switching-out'
                );
            }
        );
    }
    function cancelFeedSwitchAnimation() {
        feedSwitchSequence++;
        const rail =
            ensureRail();
        rail.classList.remove(
            'is-switching-out',
            'is-switching-in'
        );
        void rail.offsetWidth;
    }
    /* =====================================================
       LOADING / ERROR / EMPTY
       ===================================================== */
    function showInitialLoading() {
        const rail =
            ensureRail();
        rail.replaceChildren();
    }
    function showInitialError() {
        const rail =
            ensureRail();
        rail.replaceChildren();
        const state =
            document.createElement(
                'div'
            );
        state.className =
            'live-feed-state live-feed-error';
        state.textContent =
            'Live data temporarily unavailable.';
        rail.appendChild(
            state
        );
    }
    function renderEmpty(
        message
    ) {
        const rail =
            ensureRail();
        rail.replaceChildren();
        const state =
            document.createElement(
                'div'
            );
        state.className =
            'live-feed-state';
        state.textContent =
            message;
        rail.appendChild(
            state
        );
    }
    /* =====================================================
       LOAD FEED
       ===================================================== */
    async function loadFeed(
        type
    ) {
        const previousFeed =
            panel.dataset.feedType ||
            null;
        const isInitialLoad =
            previousFeed === null;
        const feedChanged =
            previousFeed !== type;
        const currentRequestSequence =
            ++requestSequence;
        activeFeed =
            type;
        if (
            feedChanged &&
            !isInitialLoad
        ) {
            cancelFeedSwitchAnimation();
        }
        if (
            requestController
        ) {
            requestController.abort();
        }
        const controller =
            new AbortController();
        requestController =
            controller;
        if (
            isInitialLoad
        ) {
            showInitialLoading();
        }
        try {
            /* -------------------------------------------------
               REQUEST
               ------------------------------------------------- */
            const response =
                await fetch(
                    `/api/live-feed/${encodeURIComponent(type)}?limit=${FEED_LIMIT}`,
                    {
                        method: 'GET',
                        cache: 'no-store',
                        signal:
                            controller.signal,
                        headers: {
                            Accept:
                                'application/json'
                        }
                    }
                );
            if (
                !response.ok
            ) {
                throw new Error(
                    `HTTP ${response.status}`
                );
            }
            const data =
                await response.json();
            /* -------------------------------------------------
               STALE REQUEST CHECK
               ------------------------------------------------- */
            if (
                currentRequestSequence !==
                requestSequence
            ) {
                return;
            }
            if (
                activeFeed !== type
            ) {

                return;
            }
            /* -------------------------------------------------
               PAYLOAD VALIDATION
               ------------------------------------------------- */
            if (
                !data ||
                !Array.isArray(
                    data.items
                )
            ) {
                throw new Error(
                    'Invalid live feed payload.'
                );
            }
            const items =
                data.items.slice(
                    0,
                    FEED_LIMIT
                );
            /* -------------------------------------------------
               VERSION
               ------------------------------------------------- */
            const version =
                getFeedVersion(
                    type,
                    {
                        ...data,
                        items
                    }
                );
            if (
                !feedChanged &&
                lastVersion[type] === version
            ) {
                return;
            }
            /* -------------------------------------------------
               EMPTY FEED
               ------------------------------------------------- */
            if (
                items.length === 0
            ) {
                const message =
                    type === 'buyers'
                        ? 'No purchases available.'
                        : 'No holder data available.';
                if (
                    isInitialLoad
                ) {
                    renderEmpty(
                        message
                    );
                }
                else if (
                    feedChanged
                ) {
                    const switched =
                        await switchFeedContent(
                            () => {
                                renderEmpty(
                                    message
                                );
                            }
                        );
                    if (
                        !switched ||
                        activeFeed !== type ||
                        currentRequestSequence !==
                        requestSequence
                    ) {
                        return;
                    }
                }
                else {
                    renderEmpty(
                        message
                    );
                }
                panel.dataset.feedType =
                    type;
                lastVersion[type] =
                    version;
                return;
            }
            /* -------------------------------------------------
               RENDER
               ------------------------------------------------- */
            if (
                feedChanged
            ) {
                const switched =
                    await switchFeedContent(
                        () => {
                            patchRail(
                                type,
                                items,
                                {
                                    preserveScroll:
                                        false
                                }
                            );
                        }
                    );
                if (
                    !switched ||
                    activeFeed !== type ||
                    currentRequestSequence !==
                    requestSequence
                ) {
                    return;
                }
            }
            else {
                patchRail(
                    type,
                    items,
                    {
                        preserveScroll:
                            true
                    }
                );
            }
            /* -------------------------------------------------
               COMMIT STATE
               ------------------------------------------------- */
            panel.dataset.feedType =
                type;
            lastVersion[type] =
                version;
        } catch (error) {
            if (
                error?.name ===
                'AbortError'
            ) {
                return;
            }
            if (
                currentRequestSequence !==
                requestSequence
            ) {

                return;
            }
            console.error(
                '[LiveFeed]',
                error
            );
            if (
                feedChanged
            ) {
                if (
                    previousFeed
                ) {
                    activeFeed =
                        previousFeed;
                    setActiveButton(
                        previousFeed
                    );
                }
            }
            const hasCards =
                Boolean(
                    panel.querySelector(
                        '.live-card'
                    )
                );
            if (
                !hasCards &&
                isInitialLoad
            ) {
                showInitialError();
            }
        }
    }
    /* =====================================================
       ACTIVE TAB
       ===================================================== */
    function setActiveButton(
        type
    ) {
        for (
            const button
            of buttons
        ) {
            button.classList.toggle(
                'is-active',
                button.dataset.liveFeed ===
                type
            );
        }
    }
    /* =====================================================
       AUTO REFRESH
       ===================================================== */
    function scheduleRefresh() {
        window.clearTimeout(
            refreshTimer
        );
        refreshTimer =
            window.setTimeout(
                async () => {
                    await loadFeed(
                        activeFeed
                    );
                    scheduleRefresh();
                },
                REFRESH_INTERVAL
            );
    }
    /* =====================================================
       TAB EVENTS
       ===================================================== */
    for (
        const button
        of buttons
    ) {
        button.addEventListener(
            'click',
            async () => {
                const type =
                    button.dataset.liveFeed;
                if (
                    !type ||
                    button.disabled
                ) {
                    return;
                }
                if (
                    type === activeFeed &&
                    panel.dataset.feedType ===
                    type
                ) {
                    return;
                }
                setActiveButton(
                    type
                );
                await loadFeed(
                    type
                );
                scheduleRefresh();
            }
        );
    }
    /* =====================================================
       HORIZONTAL WHEEL SCROLL
       ===================================================== */
    function enableWheelHorizontalScroll() {
        panel.addEventListener(
            'wheel',
            event => {
                const target =
                    event.target instanceof Element
                        ? event.target.closest(
                            '.live-feed-rail-scroll'
                        )
                        : null;
                if (!target) {
                    return;
                }
                const delta =
                    Math.abs(event.deltaX) >
                        Math.abs(event.deltaY)
                        ? event.deltaX
                        : event.deltaY;
                if (
                    !Number.isFinite(delta) ||
                    delta === 0
                ) {
                    return;
                }
                const current =
                    target.scrollLeft;
                const max =
                    target.scrollWidth -
                    target.clientWidth;
                if (
                    max <= 0
                ) {

                    return;
                }
                const next =
                    current + delta;
                const atStart =
                    current <= 0 &&
                    delta < 0;
                const atEnd =
                    current >= max &&
                    delta > 0;
                if (
                    atStart ||
                    atEnd
                ) {

                    return;
                }
                event.preventDefault();
                target.scrollLeft =
                    Math.max(
                        0,
                        Math.min(
                            max,
                            next
                        )
                    );
            },
            {
                passive: false
            }
        );
    }
    /* =====================================================
       INITIALIZATION
       ===================================================== */
    activeFeed =
        'buyers';
    showInitialLoading();
    setActiveButton(
        activeFeed
    );
    enableWheelHorizontalScroll();
    loadFeed(
        activeFeed
    )
        .finally(
            scheduleRefresh
        );
})();