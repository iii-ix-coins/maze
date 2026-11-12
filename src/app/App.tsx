import { lazy, Suspense, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AppProviders } from './providers/AppProviders';
import { AppRouter } from './router';
import { AppErrorBoundary } from './error-boundary';
import { initNavigation, usePathname } from './navigation';
import { PageLoadingProvider } from '../components/layout/PageLoadingProvider';

const MazePage = lazy(() => import('../features/maze/MazePage').then((module) => ({ default: module.MazePage })));

/** One React tree owns the persistent background, site shell, routes and page loader. */
export function App() {
  const pathname = usePathname();
  const mazeHost = document.getElementById('maze-root');
  const isMazePage = pathname === '/maze.html' && Boolean(mazeHost);

  useEffect(() => initNavigation(), []);
  useEffect(() => {
    const titles: Record<string, string> = {
      '/': 'Hollld.fun', '/coin.html': 'Token Market · Hollld', '/token': 'Token Market · Hollld',
      '/holders.html': 'Top Holders · Hollld', '/holders': 'Top Holders · Hollld',
      '/market.html': 'Market · Hollld', '/market': 'Market · Hollld', '/maze.html': 'Maze · Hollld',
    };
    document.title = titles[pathname] ?? 'Hollld.fun';
  }, [pathname]);

  return (
    <AppErrorBoundary>
      <AppProviders>
        <PageLoadingProvider waitForMazeEngine={isMazePage}>
          <AppRouter />
          {isMazePage && mazeHost
            ? createPortal(<Suspense fallback={<div className="maze-loading" role="status">Loading Maze…</div>}><MazePage /></Suspense>, mazeHost)
            : null}
        </PageLoadingProvider>
      </AppProviders>
    </AppErrorBoundary>
  );
}