/**
 * Compatibility bridge for the existing Home feature controllers.
 *
 * ES modules are imported through Vite's module graph. Classic scripts are
 * emitted as Vite assets and executed in their original classic-script scope,
 * preserving the old globals and boot sequence without keeping /public/js as
 * the active frontend source.
 */
import rainbowBorderUrl from './legacy-scripts/rainbow-border.js?url';
import numberFormatterUrl from './legacy-scripts/utils/numberFormatter.js?url';
import numberTickerUrl from './legacy-scripts/numberTicker.js?url';
import brandHeaderUrl from './legacy-scripts/components/BrandHeader.js?url';
import shareModalUrl from './legacy-scripts/components/ShareModal.js?url';
import interactionsUrl from './legacy-scripts/interactions.js?url';
import appUrl from './legacy-scripts/app.js?url';

declare global {
  interface Window {
    __hollldLegacyHomeBoot?: Promise<void>;
  }
}

type ClassicScript = { src: string };

function loadClassicScript({ src }: ClassicScript): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = Array.from(document.querySelectorAll<HTMLScriptElement>('script[data-hollld-legacy-src]'))
      .find((element) => element.dataset.hollldLegacySrc === src);

    if (existing?.dataset.loaded === 'true') {
      resolve();
      return;
    }
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.async = false;
    script.src = src;
    script.dataset.hollldLegacySrc = src;
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    }, { once: true });
    script.addEventListener('error', () => {
      script.remove();
      reject(new Error(`Failed to load compatibility script: ${src}`));
    }, { once: true });
    document.body.append(script);
  });
}

/** Load the previous script set sequentially, preserving its execution order. */
export function bootLegacyHomeScripts(): Promise<void> {
  if (window.__hollldLegacyHomeBoot) {
    return window.__hollldLegacyHomeBoot;
  }

  // Detect Maze page independently from query parameters.
  const isMazePage =
    window.location.pathname.replace(/\/+$/, '') === '/maze.html';

  const boot = (async () => {
    // Original <script type="module"> entries, now inside the Vite graph.
    await import('./legacy-scripts/maze-background-init.js');
    await import('./legacy-scripts/components/header-init.js');

    // Original classic scripts must keep classic scope (window globals).
    await loadClassicScript({ src: rainbowBorderUrl });
    await loadClassicScript({ src: numberFormatterUrl });
    await loadClassicScript({ src: numberTickerUrl });
    if (!isMazePage) {
        await loadClassicScript({ src: brandHeaderUrl });
    }
    await loadClassicScript({ src: shareModalUrl });

    // Original <script type="module"> entry for the interaction bar.
    await import('./legacy-scripts/components/InteractionBar.js');

    await loadClassicScript({ src: interactionsUrl });
    await loadClassicScript({ src: appUrl });
  })();

  window.__hollldLegacyHomeBoot = boot.catch((error: unknown) => {
    window.__hollldLegacyHomeBoot = undefined;
    throw error;
  });
  return window.__hollldLegacyHomeBoot;
}
