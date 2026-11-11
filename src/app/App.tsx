
import { createPortal } from 'react-dom';
import { AppProviders } from './providers/AppProviders';
import { AppRouter } from './router';
import { AppErrorBoundary } from './error-boundary';
import { MazePage } from '../features/maze/MazePage';
import { PageLoadingProvider } from '../components/layout/PageLoadingProvider';

/** One React tree owns the site shell, routes and global page loader. */
export function App() {
  const mazeHost = document.getElementById('maze-root');
  const isMazePage =
    window.location.pathname === '/maze.html' && Boolean(mazeHost);

  return (
    <AppErrorBoundary>
      <AppProviders>
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
