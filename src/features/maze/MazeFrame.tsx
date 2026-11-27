import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { RouteScrollbar } from '../../components/layout/RouteScrollbar';
import { usePageLoading } from '../../components/layout/PageLoadingProvider';
import { PageAccessGate, type AccessPreviewPage } from '../../components/access/PageAccessGate';
import { useIdentity } from '../../platform/identity/IdentityProvider';
import { startContentViewTransition, waitForDocumentEntryToFinish } from '../../platform/transition-coordinator';

const SITE_THEMES = ['grass', 'dark', 'light'];
const BODY_MODE_CLASSES = ['in-menu', 'wide', 'spectating'] as const;

/**
 * Persistent Maze content frame.
 *
 * This component is deliberately NOT lazy. The frame (`#mazeApp`, drawn by the
 * shared Site Content Frame rules in site.css) must exist from the very first
 * React commit, in the same paint as the persistent header and dock, exactly
 * like `.route-page` does for the other site routes.
 *
 * Previously the frame element lived inside the lazily loaded `MazePage`
 * chunk, so it did not exist while that chunk (and the engine) downloaded and
 * then popped into the page late, which read as the frame "entering".
 * Now only the *content* inside the frame is lazy; the frame, its border, its
 * scrollbar, its theme and its body-mode classes are all stable from first paint.
 */
function getRequestedMazePreview(): AccessPreviewPage {
  const view = new URLSearchParams(window.location.search).get('view');
  if (view === 'rooms') return 'rooms';
  if (view === 'live') return 'live';
  if (view === 'waiting') return 'waiting-room';
  return 'create';
}

export function MazeFrame({ children }: { children: ReactNode }) {
  const { status, isAuthenticated, error, refreshSession } = useIdentity();
  const finishPageLoading = usePageLoading();
  const [engineReady, setEngineReady] = useState(() => document.documentElement.dataset.mazeEngineReady === 'true');
  const frameRef = useRef<HTMLElement | null>(null);

  // Reveal the verified boot surface as soon as the authenticated frame is
  // committed. The engine continues loading behind this stable surface; the
  // engine-ready event then performs the second, scoped content transition.
  useEffect(() => {
    if (!isAuthenticated || engineReady) return undefined;
    let firstFrame = 0;
    let secondFrame = 0;
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(finishPageLoading);
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [isAuthenticated, engineReady, finishPageLoading]);

  useEffect(() => {
    const revealEngineContent = () => {
      void (async () => {
        // Do not start a second animation while the cross-document entry is
        // revealing the Boot surface. Once it settles, Boot -> Maze gets one
        // named, same-document transition.
        await waitForDocumentEntryToFinish();
        if (!frameRef.current?.isConnected) return;
        const transitioned = startContentViewTransition(() => {
          flushSync(() => setEngineReady(true));
        });
        if (!transitioned) setEngineReady(true);
      })();
    };
    window.addEventListener('maze:engine-ready', revealEngineContent);
    if (document.documentElement.dataset.mazeEngineReady === 'true') setEngineReady(true);
    return () => window.removeEventListener('maze:engine-ready', revealEngineContent);
  }, []);

  // Layout effect: theme and mode classes are applied before the browser paints,
  // so the frame never renders once in an intermediate (unthemed) state.
  useLayoutEffect(() => {
    const app = frameRef.current;
    if (!app) return undefined;

    const applyTheme = (theme: string | undefined) => {
      app.dataset.theme = SITE_THEMES.includes(theme ?? '') ? theme : 'grass';
    };
    const syncBodyClasses = () => {
      for (const name of BODY_MODE_CLASSES) {
        app.classList.toggle(name, document.body.classList.contains(name));
      }
    };
    const onThemeChange = (event: Event) => {
      applyTheme((event as CustomEvent<{ theme?: string }>).detail?.theme);
    };

    applyTheme(document.documentElement.dataset.theme);
    syncBodyClasses();

    const bodyObserver = new MutationObserver(syncBodyClasses);
    bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('site:themechange', onThemeChange);

    return () => {
      bodyObserver.disconnect();
      window.removeEventListener('site:themechange', onThemeChange);

      // MazeFrame owns the route lifetime, unlike MazeMenu which is not mounted
      // for guests. Always release document-level Maze modes when this frame
      // leaves the tree so normal site frame styling is restored before paint.
      document.body.classList.remove(...BODY_MODE_CLASSES);
    };
  }, []);

  return (
    <main ref={frameRef} className="maze-app in-menu" id="mazeApp">
      {isAuthenticated ? children : (
        <PageAccessGate
          page={getRequestedMazePreview()}
          status={status}
          error={error}
          onRetry={refreshSession}
        />
      )}
      {isAuthenticated && !engineReady ? (
        <div className="maze-authenticated-boot" role="status">
          <span className="maze-authenticated-boot-mark" aria-hidden="true" />
          <strong>Preparing your Maze environment…</strong>
          <small>Identity verified · Starting game services</small>
        </div>
      ) : null}
      <RouteScrollbar
        contentSelector=":scope > #createGame.cg, :scope > .access-gate"
        label={isAuthenticated ? 'Maze menu scrollbar' : 'Sign-in preview scrollbar'}
      />
    </main>
  );
}
