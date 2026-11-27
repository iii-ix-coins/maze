import './styles/index.css';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { usePageLoading } from '../../components/layout/PageLoadingProvider';
import { useLocationKey } from '../../app/navigation';
import { MazeMarkup } from './MazeMarkup';

const ENGINE_READY_TIMEOUT_MS = 10_000;

type MazePageProps = {
  active: boolean;
  authenticated: boolean;
};

/**
 * Maze's stable DOM contract plus the route-scoped Engine lifecycle.
 * The markup is retained after first authenticated activation; only mountMazeEngine/dispose run
 * as the authenticated Maze route becomes active or inactive.
 */
export function MazePage({ active, authenticated }: MazePageProps) {
  const finishPageLoading = usePageLoading();
  const locationKey = useLocationKey();
  const wasActive = useRef(false);

  useLayoutEffect(() => {
    if (!active) return undefined;

    let disposed = false;
    let disposeEngine: (() => void) | null = null;
    let readyTimer: number | undefined;
    const onEngineReady = () => {
      if (readyTimer !== undefined) window.clearTimeout(readyTimer);
      readyTimer = undefined;
      finishPageLoading();
    };

    delete document.body.dataset.mazeBootstrapError;
    window.addEventListener('maze:engine-ready', onEngineReady);
    readyTimer = window.setTimeout(() => {
      readyTimer = undefined;
      finishPageLoading();
    }, ENGINE_READY_TIMEOUT_MS);

    void import('./engine-entry').then(({ mountMazeEngine }) => {
      if (disposed) return;
      disposeEngine = mountMazeEngine();
      if (document.documentElement.dataset.mazeEngineReady === 'true') onEngineReady();
    }).catch((bootstrapError) => {
      if (disposed) return;
      console.error('[Maze] Engine mount failed:', bootstrapError);
      document.body.dataset.mazeBootstrapError = 'true';
      finishPageLoading();
    });

    return () => {
      disposed = true;
      if (readyTimer !== undefined) window.clearTimeout(readyTimer);
      window.removeEventListener('maze:engine-ready', onEngineReady);
      disposeEngine?.();
    };
  }, [active, finishPageLoading]);

  // Query-only navigation does not change the route component identity. Apply
  // updated view/invite parameters to the already-mounted runtime without
  // remounting the Engine or replacing its DOM contract.
  useEffect(() => {
    const justActivated = active && !wasActive.current;
    wasActive.current = active;
    if (!active || justActivated) return;
    void import('./engine-entry').then(({ syncMazeRouteLocation }) => {
      syncMazeRouteLocation();
    }).catch((error) => {
      console.warn('[Maze] Could not apply route query state:', error);
    });
  }, [active, locationKey]);

  return <MazeMarkup hidden={!authenticated} />;
}
