import { lazy, Suspense, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AppProviders } from './providers/AppProviders';
import { AppRouter } from './router';
import { AppErrorBoundary } from './error-boundary';
import { initNavigation, usePathname } from './navigation';
import { resolveSiteRoute, SITE_DEFAULT_TITLE } from './routes';
import { PageLoadingProvider } from '../components/layout/PageLoadingProvider';
import { SiteChromeHosts } from '../components/layout/SiteChromeHosts';

const MazePage = lazy(() => import('../features/maze/MazePage').then((module) => ({ default: module.MazePage })));

/** One React tree owns the persistent background, site shell, routes and page loader. */
export function App() {
  const pathname = usePathname();
  const route = resolveSiteRoute(pathname);
  const mazeHost = document.getElementById('maze-root');
  const isMazePage = route?.id === 'maze' && Boolean(mazeHost);

  useEffect(() => initNavigation(), []);
  useEffect(() => {
    document.title = route?.title ?? SITE_DEFAULT_TITLE;
  }, [route?.title]);

  return (
    <AppErrorBoundary>
      <AppProviders>
        <PageLoadingProvider waitForMazeEngine={isMazePage}>
          {/* Persistent site chrome lives outside the route dispatcher. */}
          <SiteChromeHosts />
          <AppRouter />
          {isMazePage && mazeHost
            ? createPortal(<Suspense fallback={<div className="maze-loading" role="status">Loading Maze…</div>}><MazePage /></Suspense>, mazeHost)
            : null}
        </PageLoadingProvider>
      </AppProviders>
    </AppErrorBoundary>
  );
}
