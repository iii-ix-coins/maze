'use strict';

import { createThemeSwitcher } from '../ThemeSwitcher.js';
import { createGameViewSwitcher } from '../GameViewSwitcher.js';

const NAV_CONFIG = {
    brand: {
        label: 'MAZE',
        href: './',
        key: 'index'
    },

    links: [
        {
            label: 'Competitions',
            href: './competitions.html',
            key: 'competitions',
            group: 'compete',
            disabled: true,
            title: 'Competitions are coming soon.'
        },
        {
            label: 'Leaderboard',
            href: './leaderboard.html',
            key: 'leaderboard',
            group: 'compete',
            disabled: true,
            title: 'Leaderboard is coming soon.'
        },
        {
            label: 'Token',
            href: './coin.html',
            key: 'token'
        },
        {
            label: 'How to Play',
            href: './how-to-play.html',
            key: 'how-to-play',
            disabled: true,
            title: 'How to Play Maze'
        }
    ]
};

function getCurrentPageKey() {
    const path = window.location.pathname
        .toLowerCase()
        .replace(/\/+$/, '');

    if (
        path === '' ||
        path === '/' ||
        path.endsWith('/index.html')
    ) {
        return 'index';
    }

    const routes = [
        {
            suffixes: ['/maze.html', '/play', '/play/'],
            key: 'maze'
        },
        {
            suffixes: [
                '/competitions.html',
                '/competitions'
            ],
            key: 'competitions'
        },
        {
            suffixes: [
                '/leaderboard.html',
                '/leaderboard'
            ],
            key: 'leaderboard'
        },
        {
            suffixes: ['/coin.html', '/token'],
            key: 'token'
        },
        {
            suffixes: [
                '/how-to-play.html',
                '/how-to-play'
            ],
            key: 'how-to-play'
        }
    ];

    for (const route of routes) {
        if (
            route.suffixes.some(suffix =>
                path.endsWith(suffix)
            )
        ) {
            return route.key;
        }
    }

    return null;
}

function createBrandLink() {
    const link = document.createElement('a');

    link.href = NAV_CONFIG.brand.href;
    link.className = 'nav-brand';
    link.setAttribute(
        'aria-label',
        'Maze home'
    );

    // Logo only (no brand name). One <img> per theme; CSS shows the one that
    // matches <html data-theme>, so switching themes needs no JS and no flash:
    //   dark -> white logo, light -> black logo, grass -> green logo.
    link.innerHTML = `
        <span class="nav-brand-mark" aria-hidden="true">
            <img
                class="nav-brand-logo nav-brand-logo--white"
                src="./css/images/maze-logo-white.svg"
                alt=""
                decoding="async"
            >
            <img
                class="nav-brand-logo nav-brand-logo--black"
                src="./css/images/maze-logo-black.svg"
                alt=""
                decoding="async"
            >
            <img
                class="nav-brand-logo nav-brand-logo--green"
                src="./css/images/maze-logo-green.svg"
                alt=""
                decoding="async"
            >
        </span>
    `;

    return link;
}

function createNavigationLink(item) {
    const element = document.createElement(
        item.disabled ? 'button' : 'a'
    );

    element.className = [
        'nav-link',
        item.primary ? 'nav-link-primary' : '',
        item.disabled ? 'nav-link-disabled' : ''
    ]
        .filter(Boolean)
        .join(' ');

    element.textContent = item.label;

    element.dataset.navKey = item.key;

    if (item.disabled) {
        element.type = 'button';
        element.disabled = true;

        element.setAttribute(
            'aria-disabled',
            'true'
        );

        element.title =
            item.title || 'Coming soon';
    } else {
        element.href = item.href;
    }

    return element;
}

function createCompeteMenu(items) {
    const group = document.createElement('div');

    group.className = 'nav-menu';
    group.dataset.navMenu = 'compete';

    const currentPage = getCurrentPageKey();

    const containsActivePage = items.some(
        item => item.key === currentPage
    );

    const trigger = document.createElement('button');

    trigger.type = 'button';
    trigger.className = 'nav-link nav-menu-trigger';
    trigger.dataset.menuTrigger = 'compete';

    trigger.innerHTML = `
        <span>Mazes</span>

        <svg
            class="nav-chevron"
            viewBox="0 -4 20 25"
            fill="none"
            aria-hidden="true"
        >
            <path
                d="M5 7.5L10 12.5L15 7.5"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
                stroke-linejoin="round"
            />
        </svg>
    `;

    if (containsActivePage) {
        trigger.classList.add('active');
    }

    trigger.setAttribute(
        'aria-expanded',
        'false'
    );

    const menuId = 'maze-compete-menu';

    trigger.setAttribute(
        'aria-controls',
        menuId
    );

    const menu = document.createElement('div');

    menu.className = 'nav-dropdown';
    menu.id = menuId;
    menu.hidden = true;

    menu.setAttribute(
        'aria-label',
        'Competition navigation'
    );

    for (const item of items) {
        const link = createNavigationLink(item);

        link.classList.add(
            'nav-dropdown-link'
        );

        menu.appendChild(link);
    }

    group.append(trigger, menu);

    return group;
}

function createWalletButton() {
    const button = document.createElement('button');

    button.type = 'button';

    button.className = 'nav-wallet-button';

    button.dataset.navAction = 'connect-wallet';

    button.innerHTML = `
        <span>Connect Wallet</span>
    `;

    button.setAttribute(
        'aria-label',
        'Connect wallet'
    );

    return button;
}

function applyActiveState(links) {
    const currentPage = getCurrentPageKey();

    for (const link of links) {
        const isActive =
            link.dataset.navKey === currentPage;

        link.classList.toggle(
            'active',
            isActive
        );

        if (isActive && !link.disabled) {
            link.setAttribute(
                'aria-current',
                'page'
            );
        } else {
            link.removeAttribute(
                'aria-current'
            );
        }
    }
}

function createMobileMenuButton() {
    const button = document.createElement('button');

    button.type = 'button';
    button.className = 'nav-mobile-toggle';

    button.setAttribute(
        'aria-label',
        'Open navigation menu'
    );

    button.setAttribute(
        'aria-expanded',
        'false'
    );

    button.setAttribute(
        'aria-controls',
        'maze-nav-content'
    );

    button.innerHTML = `
        <span></span>
        <span></span>
        <span></span>
    `;

    return button;
}

function setupNavigationInteractions(nav) {
    const competeMenu = nav.querySelector(
        '[data-nav-menu="compete"]'
    );

    const competeTrigger = nav.querySelector(
        '[data-menu-trigger="compete"]'
    );

    const dropdown = nav.querySelector(
        '.nav-dropdown'
    );

    const mobileToggle = nav.querySelector(
        '.nav-mobile-toggle'
    );

    const navContent = nav.querySelector(
        '#maze-nav-content'
    );

    function closeCompeteMenu() {
        if (!competeTrigger || !dropdown) {
            return;
        }

        competeTrigger.setAttribute(
            'aria-expanded',
            'false'
        );

        competeMenu.classList.remove(
            'is-open'
        );

        dropdown.hidden = true;
    }

    function closeMobileMenu() {
        if (!mobileToggle || !navContent) {
            return;
        }

        mobileToggle.setAttribute(
            'aria-expanded',
            'false'
        );

        mobileToggle.setAttribute(
            'aria-label',
            'Open navigation menu'
        );

        navContent.classList.remove(
            'is-mobile-open'
        );
    }

    if (competeTrigger && dropdown) {
        competeTrigger.addEventListener(
            'click',
            () => {
                const isOpen =
                    competeTrigger.getAttribute(
                        'aria-expanded'
                    ) === 'true';

                competeTrigger.setAttribute(
                    'aria-expanded',
                    String(!isOpen)
                );

                competeMenu.classList.toggle(
                    'is-open',
                    !isOpen
                );

                dropdown.hidden = isOpen;
            }
        );

        competeMenu.addEventListener(
            'keydown',
            event => {
                if (event.key === 'Escape') {
                    closeCompeteMenu();
                    competeTrigger.focus();
                }
            }
        );

        document.addEventListener(
            'click',
            event => {
                if (!competeMenu.contains(event.target)) {
                    closeCompeteMenu();
                }
            }
        );
    }

    if (mobileToggle && navContent) {
        mobileToggle.addEventListener(
            'click',
            () => {
                const isOpen =
                    mobileToggle.getAttribute(
                        'aria-expanded'
                    ) === 'true';

                mobileToggle.setAttribute(
                    'aria-expanded',
                    String(!isOpen)
                );

                mobileToggle.setAttribute(
                    'aria-label',
                    isOpen
                        ? 'Open navigation menu'
                        : 'Close navigation menu'
                );

                navContent.classList.toggle(
                    'is-mobile-open',
                    !isOpen
                );

                if (isOpen) {
                    closeCompeteMenu();
                }
            }
        );

        navContent.addEventListener(
            'click',
            event => {
                if (
                    event.target.closest(
                        'a.nav-link:not([aria-disabled="true"])'
                    )
                ) {
                    closeMobileMenu();
                    closeCompeteMenu();
                }
            }
        );

        nav.addEventListener(
            'keydown',
            event => {
                if (event.key === 'Escape') {
                    closeMobileMenu();
                    closeCompeteMenu();
                    mobileToggle.focus();
                }
            }
        );
    }
}

function createNavLinks() {
    const container = document.createElement('div');

    container.className = 'nav-links';

    const competeItems = NAV_CONFIG.links.filter(
        item => item.group === 'compete'
    );

    for (const item of NAV_CONFIG.links) {
        if (item.group === 'compete') {
            if (
                !container.querySelector(
                    '[data-nav-menu="compete"]'
                )
            ) {
                container.appendChild(
                    createCompeteMenu(competeItems)
                );
            }

            continue;
        }

        container.appendChild(
            createNavigationLink(item)
        );
    }

    return container;
}

export function createNavigation() {
    const nav = document.createElement('nav');

    nav.className = 'nav';

    nav.setAttribute(
        'aria-label',
        'Main navigation'
    );

    const header = document.createElement('div');

    header.className = 'nav-inner';

    const brand = createBrandLink();

    const content = document.createElement('div');

    content.className = 'nav-content';
    content.id = 'maze-nav-content';

    const links = createNavLinks();

    const actions = document.createElement('div');

    actions.className = 'nav-actions';

    actions.appendChild(
        createWalletButton()
    );

    content.append(links, actions);

    const mobileToggle =
        createMobileMenuButton();

    // The game-section selector and theme control live directly in .nav-inner
    // (not inside .nav-content), so both stay visible beside the hamburger on
    // mobile and share one aligned control row on desktop.
    const gameViewToggle = createGameViewSwitcher();
    const themeToggle = createThemeSwitcher();

    header.append(
        brand,
        gameViewToggle,
        content,
        themeToggle,
        mobileToggle
    );

    nav.appendChild(header);

    applyActiveState(
        nav.querySelectorAll('[data-nav-key]')
    );

    setupNavigationInteractions(nav);

    return nav;
}

export function mountNavigation(target) {
    if (!target) {
        return null;
    }

    const nav = createNavigation();

    target.replaceChildren(nav);

    return nav;
}