import { lazy, Suspense, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AppProviders } from './providers/AppProviders';
import { AppRouter } from './router';
import { AppErrorBoundary } from './error-boundary';
import { initNavigation, usePathname } from './navigation';
import { resolveSiteRoute, SITE_DEFAULT_TITLE } from './routes';
import { PageLoadingProvider } from '../components/layout/PageLoadingProvider';
import { SiteChromeHosts } from '../components/layout/SiteChromeHosts';
import { MazeFrame } from '../features/maze/MazeFrame';
import { useIdentity } from '../platform/identity/IdentityProvider';

const MazePage = lazy(() => import('../features/maze/MazePage').then((module) => ({ default: module.MazePage })));

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
  const { status } = useIdentity();
  const mazeHost = document.getElementById('maze-root');
  const isMazePage = route?.id === 'maze' && Boolean(mazeHost);

  useEffect(() => initNavigation(), []);
  useEffect(() => {
    document.title = route?.title ?? SITE_DEFAULT_TITLE;
  }, [route?.title]);

  return (
    <PageLoadingProvider waitForMazeEngine={isMazePage} identityStatus={status}>
      {/* Persistent site chrome lives outside the route dispatcher. */}
      <SiteChromeHosts />
      <AppRouter />
      {/* The Maze frame is eager and persistent; its game content is not mounted
          until the server has confirmed a valid SIWS identity session. */}
      {isMazePage && mazeHost
        ? createPortal(
            <MazeFrame>
              <Suspense fallback={null}><MazePage /></Suspense>
            </MazeFrame>,
            mazeHost,
          )
        : null}
    </PageLoadingProvider>
  );
}
