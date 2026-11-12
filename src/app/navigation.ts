import { useSyncExternalStore } from 'react';


export const LOADER_SHOW_EVENT = 'site:loader-show';
export const LOADER_HIDE_EVENT = 'site:loader-hide';

/* ---------- route table ---------- */
const SOFT_PATHS = new Set(['/', '/coin.html', '/token', '/holders.html', '/holders', '/market.html', '/market']);
const PAGE_PATHS = new Set([...SOFT_PATHS, '/maze.html']);
const TITLES: Record<string, string> = {
    '/': 'Hollld.fun',
    '/coin.html': 'Token Market · Hollld',
    '/token': 'Token Market · Hollld',
    '/holders.html': 'Top Holders · Hollld',
    '/holders': 'Top Holders · Hollld',
    '/market.html': 'Market · Hollld',
    '/market': 'Market · Hollld',
};

export function normalizePath(pathname: string) {
    const path = pathname.toLowerCase().replace(/\/+$/, '') || '/';
    return path === '/index.html' ? '/' : path;
}

/* ---------- pathname store (lets the router react to pushState) ---------- */
const listeners = new Set<() => void>();
let currentPath = normalizePath(window.location.pathname);

function emitPath() {
    currentPath = normalizePath(window.location.pathname);
    listeners.forEach((listener) => listener());
}

export function usePathname() {
    return useSyncExternalStore(
        (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        () => currentPath,
        () => currentPath,
    );
}

/** Keep route changes synchronous: data and images render progressively without blocking input. */
function resetScroll() {
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    root.style.scrollBehavior = previous;
}

export function playPageEnter(): Promise<void> {
    return Promise.resolve();
}

function swapTo(url: URL, push: boolean): void {
    if (push) window.history.pushState(null, '', url.href);
    document.title = TITLES[normalizePath(url.pathname)] ?? document.title;
    resetScroll();
    emitPath();
}

export function navigateTo(href: string) {
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) {
        window.location.assign(url.href);
        return;
    }
    if (normalizePath(url.pathname) === normalizePath(window.location.pathname) && url.search === window.location.search) return;
    if (!SOFT_PATHS.has(normalizePath(url.pathname))) {
        window.location.assign(url.href);
        return;
    }
    swapTo(url, true);
}

/* ---------- global wiring ---------- */
function onClick(event: MouseEvent) {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!anchor || (anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return;

    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin || !PAGE_PATHS.has(normalizePath(url.pathname))) return;

    const samePage =
        normalizePath(url.pathname) === normalizePath(window.location.pathname) &&
        url.search === window.location.search;
    if (samePage) {
        if (!url.hash) event.preventDefault();
        return;
    }

    event.preventDefault();
    navigateTo(url.href);
}

function onPopState() {
    if (normalizePath(window.location.pathname) === currentPath) return;
    swapTo(new URL(window.location.href), false);
}

function onPageShow(event: PageTransitionEvent) {
    if (!event.persisted) return; // restored from bfcache: undo any half-finished exit
    emitPath();
}

export function initNavigation() {
    document.addEventListener('click', onClick);
    window.addEventListener('popstate', onPopState);
    window.addEventListener('pageshow', onPageShow);
    return () => {
        document.removeEventListener('click', onClick);
        window.removeEventListener('popstate', onPopState);
        window.removeEventListener('pageshow', onPageShow);
    };
}