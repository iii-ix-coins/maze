import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { RouteScrollbar } from '../../components/layout/RouteScrollbar';
import { usePageLoading } from '../../components/layout/PageLoadingProvider';
import { PageAccessGate, type AccessPreviewPage } from '../../components/access/PageAccessGate';
import { useIdentity } from '../../platform/identity/IdentityProvider';
import { startContentViewTransition, waitForDocumentEntryToFinish } from '../../platform/transition-coordinator';

const SITE_THEMES = ['grass', 'dark', 'light'];
const BODY_MODE_CLASSES = ['in-menu', 'wide', 'spectating'] as const;

function getRequestedMazePreview(): AccessPreviewPage {
  const view = new URLSearchParams(window.location.search).get('view');
  if (view === 'rooms') return 'rooms';
  if (view === 'live') return 'live';
  if (view === 'waiting') return 'waiting-room';
  return 'create';
}

/**
 * Persistent Maze route surface.
 *
 * The frame is a permanent portal in the single App React tree. It is hidden
 * while another route is active. After the first authenticated Maze activation,
 * its markup stays mounted even while its Engine is disposed, so engine/dom.ts
 * can safely retain its DOM references across soft navigation.
 */
export function MazeFrame({ active, children }: { active: boolean; children: ReactNode }) {
  const { status, isAuthenticated, error, refreshSession } = useIdentity();
  const finishPageLoading = usePageLoading();
  const [engineReady, setEngineReady] = useState(() => document.documentElement.dataset.mazeEngineReady === 'true');
  const frameRef = useRef<HTMLElement | null>(null);
  const parkedBodyModes = useRef<string[]>([]);

  useEffect(() => {
    if (!active || !isAuthenticated) {
      setEngineReady(false);
      return;
    }
    setEngineReady(document.documentElement.dataset.mazeEngineReady === 'true');
  }, [active, isAuthenticated]);

  // Reveal the authenticated frame if the Engine takes time to download. The
  // route transition has already presented the stable boot surface; its inner
  // content is revealed by the engine-ready hand-off below.
  useEffect(() => {
    if (!active || !isAuthenticated || engineReady) return undefined;
    let firstFrame = 0;
    let secondFrame = 0;
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(finishPageLoading);
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [active, isAuthenticated, engineReady, finishPageLoading]);

  useEffect(() => {
    const revealEngineContent = () => {
      if (!active || !isAuthenticated) return;
      void (async () => {
        await waitForDocumentEntryToFinish();
        const isCurrentEngineSurface = () => {
          const frame = frameRef.current;
          return Boolean(
            frame?.isConnected &&
            frame.dataset.mazeRouteActive === 'true' &&
            document.documentElement.dataset.mazeEngineReady === 'true'
          );
        };
        if (!isCurrentEngineSurface()) return;
        const reveal = () => {
          // View Transition callbacks may run after another state transition
          // (for example Logout) has already disposed this Engine mount.
          if (!isCurrentEngineSurface()) return;
          flushSync(() => setEngineReady(true));
        };
        const transitioned = startContentViewTransition(reveal);
        if (!transitioned) reveal();
      })();
    };
    const markEngineDisposed = () => setEngineReady(false);
    window.addEventListener('maze:engine-ready', revealEngineContent);
    window.addEventListener('maze:engine-disposed', markEngineDisposed);
    if (active && isAuthenticated && document.documentElement.dataset.mazeEngineReady === 'true') {
      setEngineReady(true);
    }
    return () => {
      window.removeEventListener('maze:engine-ready', revealEngineContent);
      window.removeEventListener('maze:engine-disposed', markEngineDisposed);
    };
  }, [active, isAuthenticated]);

  // Keep document-level Maze modes out of other route styling. Their exact
  // values are parked and restored so a game/menu resumes in the same mode.
  useLayoutEffect(() => {
    const app = frameRef.current;
    if (!app) return undefined;

    const applyTheme = (theme: string | undefined) => {
      app.dataset.theme = SITE_THEMES.includes(theme ?? '') ? theme : 'grass';
    };
    const syncAppMode = () => {
      for (const name of BODY_MODE_CLASSES) {
        app.classList.toggle(name, active && document.body.classList.contains(name));
      }
    };
    const onThemeChange = (event: Event) => {
      applyTheme((event as CustomEvent<{ theme?: string }>).detail?.theme);
    };

    if (active) {
      if (parkedBodyModes.current.length) {
        document.body.classList.add(...parkedBodyModes.current);
        parkedBodyModes.current = [];
      }
      // Direct SPA entry has no HTML pre-paint pass; begin in the stable menu
      // frame until the Engine publishes its initial menu/game decision.
      if (document.documentElement.dataset.mazeEngineReady !== 'true') {
        document.body.classList.add('in-menu');
      }
    } else {
      parkedBodyModes.current = BODY_MODE_CLASSES.filter((name) => document.body.classList.contains(name));
      document.body.classList.remove(...BODY_MODE_CLASSES);
    }

    applyTheme(document.documentElement.dataset.theme);
    syncAppMode();

    const bodyObserver = new MutationObserver(syncAppMode);
    bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('site:themechange', onThemeChange);

    return () => {
      bodyObserver.disconnect();
      window.removeEventListener('site:themechange', onThemeChange);
    };
  }, [active]);

  return (
    <main
      ref={frameRef}
      className="maze-app in-menu"
      id="mazeApp"
      hidden={!active}
      aria-hidden={!active}
      data-maze-route-active={active ? 'true' : 'false'}
    >
      {active && !isAuthenticated ? (
        <PageAccessGate
          page={getRequestedMazePreview()}
          status={status}
          error={error}
          onRetry={refreshSession}
        />
      ) : null}
      {children}
      {active && isAuthenticated && !engineReady ? (
        <div className="maze-authenticated-boot" role="status">
          <span className="maze-authenticated-boot-mark" aria-hidden="true" />
          <strong>Preparing your Maze environment…</strong>
          <small>Identity verified · Starting game services</small>
        </div>
      ) : null}
      {active ? (
        <RouteScrollbar
          contentSelector=":scope > #createGame.cg, :scope > .access-gate"
          label={isAuthenticated ? 'Maze menu scrollbar' : 'Sign-in preview scrollbar'}
        />
      ) : null}
    </main>
  );
}
