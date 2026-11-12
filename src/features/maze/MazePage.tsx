import './styles/maze-site.css';
import './styles/maze-unify.css';
import './styles/maze-theme.css';
import './styles/create-game.css';
import './styles/lobby.css';
import './ui/react/maze-menu.css';
import { useEffect } from 'react';
import { usePageLoading } from '../../components/layout/PageLoadingProvider';
import { MazeMarkup } from './MazeMarkup';

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
  const finishPageLoading = usePageLoading();
  useEffect(() => {
    let disposed = false;
    let viewTimer: number | undefined;
    let bodyObserver: MutationObserver | undefined;

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

    void (async () => {
      try {
        // Site chrome and the complete static Maze UI tree are mounted by React.
        // The independent engine starts only after those DOM nodes have committed.
        await import('./engine-entry');
        if (disposed) return;

        finishPageLoading();

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
        finishPageLoading();
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
  }, [finishPageLoading]);

  return (
    <main className="maze-app in-menu" id="mazeApp">
      <MazeMarkup />
    </main>
  );
}
