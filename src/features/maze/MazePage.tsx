import { useEffect } from 'react';
import mazeMarkup from './maze-markup.html?raw';
import { bootLegacyHomeScripts } from '../home/legacy-home-runtime';
import './styles/maze-site.css';
import './styles/maze-unify.css';

/**
 * React-owned Maze page surface.
 *
 * The static markup is the exact existing Maze DOM contract (IDs, classes,
 * canvas elements and control nodes). The TypeScript game engine binds to those
 * nodes after React commits them. Keeping that DOM contract stable is deliberate:
 * the renderer, input handlers, save format and multiplayer protocol are not
 * rewritten as part of a frontend bundler/framework migration.
 */
export function MazePage() {
  useEffect(() => {
    let disposed = false;
    let viewTimer: number | undefined;
    let bodyObserver: MutationObserver | undefined;
    document.body.classList.add('page-loading', 'in-menu');

    const app = document.getElementById('mazeApp');

    const applyTheme = (theme: string | undefined) => {
      if (!app) return;
      app.dataset.theme = ['grass', 'dark', 'light'].includes(theme ?? '') ? theme : 'grass';
    };
    const syncBodyClasses = () => {
      if (!app) return;
      for (const name of ['in-menu', 'wide', 'spectating']) {
        app.classList.toggle(name, document.body.classList.contains(name));
      }
    };
    const onThemeChange = (event: Event) => {
      const detail = (event as CustomEvent<{ theme?: string }>).detail;
      applyTheme(detail?.theme);
    };

    applyTheme(document.documentElement.dataset.theme);
    syncBodyClasses();
    bodyObserver = new MutationObserver(syncBodyClasses);
    bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('site:themechange', onThemeChange);

    const multiplayerMeta = document.querySelector<HTMLMetaElement>('meta[name="maze-multiplayer-url"]');
    if (multiplayerMeta && !multiplayerMeta.content.trim()) {
      const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      multiplayerMeta.content = `${scheme}//${window.location.hostname}:8081`;
    }

    void (async () => {
      try {
        // Reuse the exact existing site chrome boot order before initializing Maze.
        await bootLegacyHomeScripts();
        if (disposed) return;

        // The Maze source is now compiled by the repository-root Vite build.
        // Importing after React commits the DOM preserves the engine's existing
        // document.getElementById bindings and avoids a second frontend document.
        await import('./engine-entry');
        if (disposed) return;

        const view = new URLSearchParams(window.location.search).get('view');
        if (view && ['create', 'rooms', 'live'].includes(view)) {
          const tabId = view === 'create' ? 'tabCreate' : view === 'rooms' ? 'tabRooms' : 'tabLive';
          let attempts = 0;
          viewTimer = window.setInterval(() => {
            document.getElementById(tabId)?.click();
            attempts += 1;
            if (
              attempts >= 10 ||
              document.getElementById(tabId)?.getAttribute('aria-selected') === 'true'
            ) {
              if (viewTimer !== undefined) window.clearInterval(viewTimer);
            }
          }, 150);
        }
      } catch (error) {
        console.error('[Maze] React/Vite bootstrap failed:', error);
        document.body.dataset.mazeBootstrapError = 'true';
      }
    })();

      return () => {
        disposed = true;

        if (viewTimer !== undefined) {
          window.clearInterval(viewTimer);
        }

        bodyObserver?.disconnect();
        window.removeEventListener('site:themechange', onThemeChange);
      };
  }, []);

  return (
    <main
      className="maze-app in-menu"
      id="mazeApp"
      dangerouslySetInnerHTML={{ __html: mazeMarkup }}
    />
  );
}
