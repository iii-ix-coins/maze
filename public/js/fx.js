'use strict';

/*
 * fx.js — progressive-enhancement layer for the Obsidian Labyrinth design.
 * --------------------------------------------------------------------
 * Nothing here is required for the site to work; every effect only adds
 * classes / CSS variables that css/*.css already know how to style.
 *
 *   1. Header compaction          html[data-scrolled="true|false"]
 *   2. Cursor spotlight           --mx / --my on hovered tiles
 *   3. Skeleton placeholders      [data-empty="true"] while a value is "--"
 *   4. Auto tone                  [data-tone-auto] → data-tone="good|bad"
 *   5. Drag-to-scroll             live-feed rail (mouse)
 *   6. Tilt (opt-in)              [data-tilt]
 */
(() => {

    const root = document.documentElement;
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ==================================================================
       1 · HEADER COMPACTION  (with hysteresis so layout shifts can't loop)
       ================================================================== */

    let scrolled = false;
    let scrollFrame = 0;

    function readScroll() {
        scrollFrame = 0;

        const y = window.scrollY;

        if (!scrolled && y > 72) {
            scrolled = true;
        } else if (scrolled && y < 18) {
            scrolled = false;
        }

        if (root.dataset.scrolled !== String(scrolled)) {
            root.dataset.scrolled = String(scrolled);
        }
    }

    window.addEventListener('scroll', () => {
        if (!scrollFrame) {
            scrollFrame = requestAnimationFrame(readScroll);
        }
    }, { passive: true });

    readScroll();

    /* ==================================================================
       2 · CURSOR SPOTLIGHT
       ================================================================== */

    const SPOT_SELECTOR = [
        '.token-summary-item', '.coin-metric', '.coin-flow-card', '.coin-audit-item',
        '.coin-project-item', '.coin-period-card', '.live-card', '.bar-box',
        '.change-box', '.maze-tile', '.spot'
    ].join(',');

    if (finePointer) {
        document.addEventListener('pointermove', event => {
            const target = event.target;

            if (!(target instanceof Element)) {
                return;
            }

            const card = target.closest(SPOT_SELECTOR);

            if (!card) {
                return;
            }

            const rect = card.getBoundingClientRect();

            card.style.setProperty('--mx', `${(event.clientX - rect.left).toFixed(1)}px`);
            card.style.setProperty('--my', `${(event.clientY - rect.top).toFixed(1)}px`);
        }, { passive: true });
    }

    /* ==================================================================
       3 · SKELETONS   &   4 · AUTO TONE
       ================================================================== */

    const SKELETON_SELECTOR = [
        '.metric-value', '.change-box > div:not(.change-period)', '[data-market]',
        '.coin-metric > strong', '.coin-flow-card > strong', '.coin-audit-item > strong',
        '.coin-project-item > strong', '.coin-name', '.coin-symbol', '.coin-address',
        '.coin-chip', '.token-summary-title', '.token-summary-symbol', '.holders-count'
    ].join(',');

    const PLACEHOLDERS = new Set(['', '--', '$', '$--', '-']);

    function evaluate(element) {
        const text = (element.textContent || '').trim();

        if (element.matches(SKELETON_SELECTOR)) {
            const empty = PLACEHOLDERS.has(text);

            if (empty) {
                element.dataset.empty = 'true';
            } else if (element.dataset.empty) {
                delete element.dataset.empty;
            }
        }

        if (element.hasAttribute('data-tone-auto')) {
            let tone = '';

            if (/^\+\s*\d/.test(text) && !/^\+\s*0(\.0+)?\s*%?$/.test(text)) {
                tone = 'good';
            } else if (/^[-−]\s*\d/.test(text) && !/^[-−]\s*0(\.0+)?\s*%?$/.test(text)) {
                tone = 'bad';
            }

            if (tone) {
                element.dataset.tone = tone;
            } else {
                delete element.dataset.tone;
            }
        }
    }

    function sweep(scope) {
        const selector = `${SKELETON_SELECTOR},[data-tone-auto]`;

        if (scope.matches?.(selector)) {
            evaluate(scope);
        }

        scope.querySelectorAll?.(selector).forEach(evaluate);
    }

    let pending = new Set();
    let sweepFrame = 0;

    function flush() {
        sweepFrame = 0;

        const batch = pending;
        pending = new Set();

        for (const node of batch) {
            if (node.isConnected) {
                sweep(node);
            }
        }
    }

    function queue(node) {
        const element = node instanceof Element ? node : node.parentElement;

        if (!element) {
            return;
        }

        pending.add(element);

        if (!sweepFrame) {
            sweepFrame = requestAnimationFrame(flush);
        }
    }

    const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            queue(mutation.target);
        }
    });

    /* a value still "--" after 7 s is empty, not loading → CSS stops the shimmer */
    window.setTimeout(() => { root.dataset.settled = 'true'; }, 7000);

    function boot() {
        sweep(document.body);

        observer.observe(document.body, {
            childList: true,
            characterData: true,
            subtree: true
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }

    /* ==================================================================
       5 · DRAG-TO-SCROLL  (live-feed rail, mouse only)
       ================================================================== */

    if (finePointer) {
        let rail = null;
        let startX = 0;
        let startLeft = 0;
        let moved = false;

        document.addEventListener('pointerdown', event => {
            if (event.button !== 0 || !(event.target instanceof Element)) {
                return;
            }

            const candidate = event.target.closest('.live-feed-rail-scroll');

            if (!candidate || event.target.closest('button, a')) {
                return;
            }

            rail = candidate;
            startX = event.clientX;
            startLeft = rail.scrollLeft;
            moved = false;
        });

        window.addEventListener('pointermove', event => {
            if (!rail) {
                return;
            }

            const delta = event.clientX - startX;

            if (Math.abs(delta) > 4) {
                moved = true;
                rail.classList.add('is-dragging');
            }

            if (moved) {
                rail.scrollLeft = startLeft - delta;
            }
        }, { passive: true });

        const release = () => {
            if (rail) {
                rail.classList.remove('is-dragging');
            }

            rail = null;
        };

        window.addEventListener('pointerup', release);
        window.addEventListener('pointercancel', release);
    }

    /* ==================================================================
       6 · TILT  (opt-in: <div data-tilt>)
       ================================================================== */

    if (finePointer && !reducedMotion) {
        document.addEventListener('pointermove', event => {
            if (!(event.target instanceof Element)) {
                return;
            }

            const card = event.target.closest('[data-tilt]');

            if (!card) {
                return;
            }

            const rect = card.getBoundingClientRect();
            const px = (event.clientX - rect.left) / rect.width - 0.5;
            const py = (event.clientY - rect.top) / rect.height - 0.5;

            card.style.setProperty('--tilt-x', `${(-py * 7).toFixed(2)}deg`);
            card.style.setProperty('--tilt-y', `${(px * 9).toFixed(2)}deg`);
        }, { passive: true });

        document.addEventListener('pointerout', event => {
            if (!(event.target instanceof Element)) {
                return;
            }

            const card = event.target.closest('[data-tilt]');

            if (card && !card.contains(event.relatedTarget)) {
                card.style.removeProperty('--tilt-x');
                card.style.removeProperty('--tilt-y');
            }
        });
    }

})();
