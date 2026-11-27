import { useSyncExternalStore } from 'react';
import {
    CLIENT_ROUTE_PATHS,
    normalizePath,
    resolveSiteRoute,
    canSoftNavigateBetween,
} from './routes';
import {
    animatePendingDocumentEntry,
    consumePendingDocumentEntry,
    navigateDocument,
    prefersReducedMotion,
    startContentViewTransition,
    supportsSameDocumentViewTransitions,
    getDocumentTransitionSurface,
} from '../platform/transition-coordinator';
import { isRoutePageLoaded, preloadSiteRoutePage } from './route-loaders';

export const LOADER_SHOW_EVENT = 'site:loader-show';
export const LOADER_HIDE_EVENT = 'site:loader-hide';

/* ---------- pathname store (lets the router react to pushState) ---------- */
const listeners = new Set<() => void>();
let currentPath = normalizePath(window.location.pathname);
let currentLocationKey = `${currentPath}${window.location.search}${window.location.hash}`;

function emitPath() {
    currentPath = normalizePath(window.location.pathname);
    currentLocationKey = `${currentPath}${window.location.search}${window.location.hash}`;
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

/** Full same-document location snapshot for route-local query/hash state. */
export function useLocationKey() {
    return useSyncExternalStore(
        (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        () => currentLocationKey,
        () => currentLocationKey,
    );
}

/** Keep route changes synchronous: data and images render progressively without blocking input. */
function resetRouteScroll() {
    const pageScroller = document.querySelector<HTMLElement>(
        '.route-page > .feature-page-shell'
    );
    if (pageScroller) pageScroller.scrollTop = 0;
}

export async function playPageEnter(): Promise<void> {
    // Only cross-document fallbacks need a JS entrance; native View Transitions
    // already animate the named content surface. The marker is consumed once.
    if (consumePendingDocumentEntry()) await animatePendingDocumentEntry();
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
    const canCaptureDestination = destinationIsReady;

    // The coordinator uses native View Transitions where available and WAAPI
    // otherwise, but only after the destination lazy chunk has resolved. On a
    // first visit, React Suspense could otherwise capture an empty frame.
    if (canCaptureDestination && startContentViewTransition(() => applyRouteSwap(url, push))) return;

    // The CSS fallback gives the current surface a short exit before React
    // replaces it. For browsers with View Transitions, mark the destination
    // so its entrance still runs after a first-visit lazy chunk resolves.
    const hasRouteSurface = Boolean(getDocumentTransitionSurface());
    if (!prefersReducedMotion() && hasRouteSurface) {
        if (supportsSameDocumentViewTransitions()) {
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

function confirmMazeRouteExit(nextPath: string): boolean {
    const currentIsMaze = resolveSiteRoute(currentPath)?.id === 'maze';
    const nextIsMaze = resolveSiteRoute(nextPath)?.id === 'maze';
    if (!currentIsMaze || nextIsMaze) return true;
    if (document.documentElement.dataset.mazeEngineReady !== 'true'
        || document.documentElement.dataset.mazeActiveRun !== 'true') return true;
    return window.confirm('You have an unfinished Maze run. Leaving now will stop this run. Continue?');
}

export function navigateTo(href: string) {
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) {
        window.location.assign(url.href);
        return;
    }
    if (normalizePath(url.pathname) === normalizePath(window.location.pathname) && url.search === window.location.search) return;
    if (!confirmMazeRouteExit(url.pathname)) return;
    if (!canSoftNavigateBetween(window.location.pathname, url.pathname)) {
        void navigateDocument(url);
        return;
    }

    // Entering/leaving the Maze runtime is now a route transition. A route
    // chunk may load in parallel with the outgoing surface's CSS fallback;
    // the persistent Maze DOM remains mounted after its first visit.
    void preloadSiteRoutePage(url.pathname).catch(() => undefined);
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
    const nextLocationKey = `${nextPath}${window.location.search}${window.location.hash}`;
    if (pendingRouteSwap !== null) cancelPendingRouteSwap();
    if (nextLocationKey === currentLocationKey) return;
    if (nextPath === currentPath) {
        emitPath();
        return;
    }

    if (!confirmMazeRouteExit(nextPath)) {
        // popstate has already changed the URL; restore the last committed SPA URL.
        const previous = new URL(currentLocationKey, window.location.origin);
        window.history.pushState(null, '', previous.href);
        return;
    }

    // All registered site routes, including Maze, share one document and one
    // transition coordinator. Only paths outside the client route set reload.
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
