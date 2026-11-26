import './styles/index.css';
import { useEffect } from 'react';
import { usePageLoading } from '../../components/layout/PageLoadingProvider';
import { MazeMarkup } from './MazeMarkup';

/** Upper bound for holding the page loader if the engine never reports readiness. */
const ENGINE_READY_TIMEOUT_MS = 10_000;

/**
 * Lazy Maze page CONTENT.
 *
 * The persistent content frame (`#mazeApp`, its border, scrollbar, theme and
 * body-mode classes) is owned by the eager `MazeFrame` and is never created or
 * destroyed by this component. This component only renders the static Maze DOM
 * contract (IDs, classes, canvas elements and control nodes) inside that frame
 * and boots the independent game engine after those nodes have committed.
 * Keeping that DOM contract stable is deliberate: the renderer, input handlers,
 * save format and multiplayer protocol are not rewritten.
 *
 * The initial Create / Rooms / Live view comes from `?view=` and is applied by
 * the UI store before the first render, so no tab is clicked programmatically
 * and the content never visibly switches views while booting.
 */
export function MazePage() {
  const finishPageLoading = usePageLoading();

  useEffect(() => {
    let disposed = false;
    let readyTimer: number | undefined;
    let onEngineReady: (() => void) | undefined;

    void (async () => {
      try {
        // Site chrome, the persistent frame and the complete static Maze UI tree
        // are mounted by React. The engine starts only after those nodes commit.
        await import('./engine-entry');
        if (disposed) return;

        // Hold the page loader until the engine has chosen its first menu/game
        // state, so the content is revealed once, already in its final state.
        if (document.documentElement.dataset.mazeEngineReady !== 'true') {
          await new Promise<void>((resolve) => {
            onEngineReady = () => resolve();
            window.addEventListener('maze:engine-ready', onEngineReady, { once: true });
            readyTimer = window.setTimeout(resolve, ENGINE_READY_TIMEOUT_MS);
          });
          if (disposed) return;
        }

        finishPageLoading();
      } catch (error) {
        console.error('[Maze] React/Vite bootstrap failed:', error);
        document.body.dataset.mazeBootstrapError = 'true';
        finishPageLoading();
      }
    })();

    return () => {
      disposed = true;
      if (readyTimer !== undefined) window.clearTimeout(readyTimer);
      if (onEngineReady) window.removeEventListener('maze:engine-ready', onEngineReady);
    };
  }, [finishPageLoading]);

  return <MazeMarkup />;
}
