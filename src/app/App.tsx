import { lazy, Suspense, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AppProviders } from './providers/AppProviders';
import { AppRouter } from './router';
import { AppErrorBoundary } from './error-boundary';
import { initNavigation, usePathname } from './navigation';
import { resolveSiteRoute, SITE_DEFAULT_TITLE } from './routes';
import { loadMazePage } from './route-loaders';
import { PageLoadingProvider } from '../components/layout/PageLoadingProvider';
import { SiteChromeHosts } from '../components/layout/SiteChromeHosts';
import { MazeFrame } from '../features/maze/MazeFrame';
import { useIdentity } from '../platform/identity/IdentityProvider';

const MazePage = lazy(loadMazePage);

/** One React tree owns the persistent background, site shell, routes and page loader. */
export function App() {
  return (
    <AppErrorBoundary>
      <AppProviders>
        <AppContent />
      </AppProviders>
    </AppErrorBoundary>
  );
}

function AppContent() {
  const pathname = usePathname();
  const route = resolveSiteRoute(pathname);
  const { status, isAuthenticated } = useIdentity();
  const mazeHost = document.getElementById('maze-root');
  const isMazePage = route?.id === 'maze';
  // Load the sizeable Maze UI on first authenticated activation, then keep its exact DOM
  // nodes alive for the lifetime of this React root. The engine caches these
  // nodes at module evaluation, so route changes must never replace them.
  const [hasMountedMaze, setHasMountedMaze] = useState(isMazePage && isAuthenticated);

  useEffect(() => initNavigation(), []);
  useEffect(() => {
    if (isMazePage && isAuthenticated) setHasMountedMaze(true);
  }, [isMazePage, isAuthenticated]);
  useEffect(() => {
    document.title = route?.title ?? SITE_DEFAULT_TITLE;
  }, [route?.title]);

  return (
    <PageLoadingProvider waitForMazeEngine={isMazePage} identityStatus={status}>
      {/* Persistent site chrome lives outside the route dispatcher. */}
      <SiteChromeHosts />
      <AppRouter />
      {/* One portal target remains in this React root. MazeFrame is present but
          hidden on other routes. After its first authenticated activation, the
          original game DOM stays mounted while only the Engine runtime changes. */}
      {mazeHost
        ? createPortal(
            <MazeFrame active={isMazePage}>
              <Suspense fallback={null}>
                {hasMountedMaze ? (
                  <MazePage active={isMazePage && isAuthenticated} authenticated={isAuthenticated} />
                ) : null}
              </Suspense>
            </MazeFrame>,
            mazeHost,
          )
        : null}
    </PageLoadingProvider>
  );
}
