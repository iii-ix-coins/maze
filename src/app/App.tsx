import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AppProviders } from './providers/AppProviders';
import { AppRouter } from './router';
import { AppErrorBoundary } from './error-boundary';
import { initNavigation } from './navigation';
import { MazePage } from '../features/maze/MazePage';
import { MazeBackground } from '../features/theme/MazeBackground';
import { PageLoadingProvider } from '../components/layout/PageLoadingProvider';

/** One React tree owns the persistent background, site shell, routes and page loader. */
export function App() {
  const mazeHost = document.getElementById('maze-root');
  const isMazePage =
    window.location.pathname === '/maze.html' && Boolean(mazeHost);

  useEffect(() => initNavigation(), []);

  return (
    <AppErrorBoundary>
      <AppProviders>
        <MazeBackground />
        <PageLoadingProvider waitForMazeEngine={isMazePage}>
          <AppRouter />
          {isMazePage && mazeHost
            ? createPortal(<MazePage />, mazeHost)
            : null}
        </PageLoadingProvider>
      </AppProviders>
    </AppErrorBoundary>
  );
}