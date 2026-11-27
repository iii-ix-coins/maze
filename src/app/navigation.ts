import { useSyncExternalStore } from 'react';
import {
    CLIENT_ROUTE_PATHS,
    normalizePath,
    resolveSiteRoute,
    canSoftNavigateBetween,
} from './routes';
import { prefersReducedMotion, startScopedViewTransition, supportsScopedViewTransitions } from '../platform/scoped-view-transition';
import { isRoutePageLoaded } from './route-loaders';

export const LOADER_SHOW_EVENT = 'site:loader-show';
export const LOADER_HIDE_EVENT = 'site:loader-hide';

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
function resetRouteScroll() {
    const pageScroller = document.querySelector<HTMLElement>(
        '.route-page > .feature-page-shell'
    );
    if (pageScroller) pageScroller.scrollTop = 0;
}

export function playPageEnter(): Promise<void> {
    return Promise.resolve();
}

const ROUTE_EXIT_DURATION_MS = 130;
let pendingRouteSwap: number | null = null;

function cancelPendingRouteSwap(): void {
    if (pendingRouteSwap !== null) {
        window.clearTimeout(pendingRouteSwap);
        pendingRouteSwap = null;
    }
    delete document.documentElement.dataset.siteRouteExiting;
    delete document.documentElement.dataset.siteRouteFallback;
}

function applyRouteSwap(url: URL, push: boolean): void {
    if (push) window.history.pushState(null, '', url.href);
    resetRouteScroll();
    emitPath();
}

function swapTo(url: URL, push: boolean): void {
    cancelPendingRouteSwap();

    const destinationPage = resolveSiteRoute(url.pathname)?.page ?? '';
    const destinationIsReady = isRoutePageLoaded(destinationPage);
    const canCaptureDestination = supportsScopedViewTransitions() && destinationIsReady;

    // A native transition is used only when the destination lazy chunk has
    // already resolved. On a first visit, React Suspense would otherwise
    // capture an empty frame; use the CSS fallback for that one navigation.
    if (canCaptureDestination && startScopedViewTransition(() => applyRouteSwap(url, push))) return;

    // The CSS fallback gives the current surface a short exit before React
    // replaces it. For browsers with View Transitions, mark the destination
    // so its entrance still runs after a first-visit lazy chunk resolves.
    const hasRouteSurface = Boolean(document.querySelector('.route-page > .feature-page-shell'));
    if (!prefersReducedMotion() && hasRouteSurface) {
        if (supportsScopedViewTransitions()) {
            document.documentElement.dataset.siteRouteFallback = 'true';
        }
        document.documentElement.dataset.siteRouteExiting = 'true';
        pendingRouteSwap = window.setTimeout(() => {
            pendingRouteSwap = null;
            delete document.documentElement.dataset.siteRouteExiting;
            applyRouteSwap(url, push);
        }, ROUTE_EXIT_DURATION_MS);
        return;
    }

    applyRouteSwap(url, push);
}

export function navigateTo(href: string) {
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) {
        window.location.assign(url.href);
        return;
    }
    if (normalizePath(url.pathname) === normalizePath(window.location.pathname) && url.search === window.location.search) return;
    // Maze is a standalone runtime document. Crossing the SPA boundary in
    // either direction must be a document navigation so its engine lifecycle
    // and body-level frame mode cannot leak into ordinary site routes.
    if (!canSoftNavigateBetween(window.location.pathname, url.pathname)) {
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
    if (url.origin !== window.location.origin || !CLIENT_ROUTE_PATHS.has(normalizePath(url.pathname))) return;

    const samePage =
        normalizePath(url.pathname) === normalizePath(window.location.pathname) &&
        url.search === window.location.search;
    if (samePage) {
        // A click back to the still-current page cancels a pending CSS fallback.
        if (pendingRouteSwap !== null) cancelPendingRouteSwap();
        if (!url.hash) event.preventDefault();
        return;
    }

    if (!resolveSiteRoute(url.pathname)) return;
    event.preventDefault();
    navigateTo(url.href);
}

function onPopState() {
    const nextPath = normalizePath(window.location.pathname);
    if (pendingRouteSwap !== null) cancelPendingRouteSwap();
    if (nextPath === currentPath) return;

    // Back/Forward must respect the same document boundary as ordinary links.
    // The browser has already changed the URL for popstate, so reload that URL.
    if (!canSoftNavigateBetween(currentPath, nextPath)) {
        window.location.reload();
        return;
    }

    swapTo(new URL(window.location.href), false);
}

function onPageShow(event: PageTransitionEvent) {
    if (!event.persisted) return; // restored from bfcache: resync the route snapshot
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
