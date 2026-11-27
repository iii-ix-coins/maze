import { useEffect, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { usePageLoading } from '../../components/layout/PageLoadingProvider';
import { useIdentity } from '../../platform/identity/IdentityProvider';
import { startContentViewTransition, waitForDocumentEntryToFinish } from '../../platform/transition-coordinator';

/**
 * Persistent Maze route view inside the one shared site content surface.
 * The parent .route-page supplies the frame, while its single .feature-page-shell
 * owns scrolling, gutters and the custom scrollbar for every route. This node
 * owns only Maze presentation state and the route-scoped Engine host.
 * Its markup remains mounted after first authenticated activation because
 * engine/dom.ts retains stable DOM references across soft navigation.
 */
export function MazeFrame({ active, children }: { active: boolean; children: ReactNode }) {
  const { isAuthenticated } = useIdentity();
  const finishPageLoading = usePageLoading();
  const [engineReady, setEngineReady] = useState(() => document.documentElement.dataset.mazeEngineReady === 'true');
  const frameRef = useRef<HTMLElement | null>(null);

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

  // Maze runtime state remains local to this feature host. It never changes
  // the Site route frame, scroll owner, gutters, or outer layout in gameplay.

  return (
    <section
      ref={frameRef}
      className="route-view maze-app in-menu"
      id="mazeApp"
      hidden={!active}
      aria-hidden={!active}
      data-maze-route-active={active ? 'true' : 'false'}
    >
      {children}
      {active && isAuthenticated && !engineReady ? (
        <div className="maze-authenticated-boot" role="status">
          <span className="maze-authenticated-boot-mark" aria-hidden="true" />
          <strong>Preparing your Maze environment…</strong>
          <small>Identity verified · Starting game services</small>
        </div>
      ) : null}
    </section>
  );
}
