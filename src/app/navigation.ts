import { useSyncExternalStore } from 'react';
import { beginPageReadinessCycle, waitForPageReadiness } from './page-readiness';

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

/* ---------- timing (ms) ---------- */
const EXIT_MS = 380;
const ENTER_MS = 520;
const STAGGER_MS = 80;
const MAX_STAGGER_TOTAL_MS = 560;
const MIN_LOADER_MS = 450;
const EASE_IN = 'cubic-bezier(0.64, 0, 0.78, 0)';
const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';

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

/* ---------- animation helpers (Web Animations API: no CSS class conflicts) ---------- */
let busy = false;
let running: Animation[] = [];

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, Math.max(0, ms)));
const nextPaint = () =>
    new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

function cancelRunning() {
    running.forEach((animation) => animation.cancel());
    running = [];
}

/** Page sections that are visible in the viewport, top to bottom. */
function collectBlocks(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>('#root > main > *')).filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
    });
}

/** Alternating left/right, one after another from the top. */
function run(blocks: HTMLElement[], direction: 'out' | 'in'): Promise<void> {
    if (!blocks.length || reducedMotion()) return Promise.resolve();
    const step = Math.min(STAGGER_MS, MAX_STAGGER_TOTAL_MS / blocks.length);
    const distance = window.innerWidth;

    const animations = blocks.map((el, index) => {
        const offscreen = `translateX(${(index % 2 === 0 ? -1 : 1) * distance}px)`;
        const frames: Keyframe[] =
            direction === 'out'
                ? [{ transform: 'translateX(0)', opacity: 1 }, { transform: offscreen, opacity: 0 }]
                : [{ transform: offscreen, opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }];
        return el.animate(frames, {
            duration: direction === 'out' ? EXIT_MS : ENTER_MS,
            delay: index * step,
            easing: direction === 'out' ? EASE_IN : EASE_OUT,
            fill: direction === 'out' ? 'forwards' : 'backwards',
        });
    });

    running.push(...animations);
    return Promise.all(animations.map((animation) => animation.finished))
        .then(() => undefined)
        .catch(() => undefined);
}

function playExit(): Promise<void> {
    const blocks = collectBlocks();
    if (blocks.length) return run(blocks, 'out');

    // Maze page has a single surface: fade it.
    const maze = document.getElementById('mazeApp');
    if (!maze || reducedMotion()) return Promise.resolve();
    const animation = maze.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: EXIT_MS,
        easing: EASE_IN,
        fill: 'forwards',
    });
    running.push(animation);
    return animation.finished.then(() => undefined).catch(() => undefined);
}

/** Called once when a freshly loaded document finishes its page loader. */
export function playPageEnter(): Promise<void> {
    return run(collectBlocks(), 'in');
}

function resetScroll() {
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto'; // html has scroll-behavior: smooth
    window.scrollTo(0, 0);
    root.style.scrollBehavior = previous;
}

/* ---------- soft transition: exit -> loader over background -> swap -> enter ---------- */
async function swapTo(url: URL, push: boolean): Promise<void> {
    busy = true;
    const root = document.documentElement;
    try {
        await playExit();

        window.dispatchEvent(new Event(LOADER_SHOW_EVENT));
        const startedAt = performance.now();

        // The flag hides the incoming page and tells MazeBackground to ignore
        // the scroll reset (otherwise the camera would jump).
        root.dataset.pageSwap = 'true';
        beginPageReadinessCycle();
        if (push) window.history.pushState(null, '', url.href);
        document.title = TITLES[normalizePath(url.pathname)] ?? document.title;
        resetScroll();
        emitPath();

        await nextPaint();
        await waitForPageReadiness();
        await wait((reducedMotion() ? 0 : MIN_LOADER_MS) - (performance.now() - startedAt));

        window.dispatchEvent(new Event(LOADER_HIDE_EVENT));
        const entering = run(collectBlocks(), 'in'); // animations take over before the flag is removed
        delete root.dataset.pageSwap;
        await entering;
    } finally {
        delete root.dataset.pageSwap;
        cancelRunning();
        busy = false;
    }
}

export function navigateTo(href: string) {
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) {
        window.location.assign(url.href);
        return;
    }
    if (busy) return;
    if (
        normalizePath(url.pathname) === normalizePath(window.location.pathname) &&
        url.search === window.location.search
    ) {
        return;
    }

    const soft =
        SOFT_PATHS.has(normalizePath(window.location.pathname)) && SOFT_PATHS.has(normalizePath(url.pathname));
    if (soft) {
        void swapTo(url, true);
        return;
    }

    // Maze <-> other pages: exit animation, then a normal document navigation.
    busy = true;
    void playExit().then(() => window.location.assign(url.href));
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
    if (busy) {
        emitPath();
        return;
    }
    void swapTo(new URL(window.location.href), false);
}

function onPageShow(event: PageTransitionEvent) {
    if (!event.persisted) return; // restored from bfcache: undo any half-finished exit
    cancelRunning();
    busy = false;
    delete document.documentElement.dataset.pageSwap;
    window.dispatchEvent(new Event(LOADER_HIDE_EVENT));
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