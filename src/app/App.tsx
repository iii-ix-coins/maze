import { createPortal } from 'react-dom';
import { AppProviders } from './providers/AppProviders';
import { AppRouter } from './router';
import { AppErrorBoundary } from './error-boundary';
import { MazePage } from '../features/maze/MazePage';

/** One React tree owns both the site shell and the Maze route. */
export function App() {
  const mazeHost = document.getElementById('maze-root');
  const isMazePage = window.location.pathname === '/maze.html' && Boolean(mazeHost);

  return (
    <AppErrorBoundary>
      <AppProviders>
        <AppRouter />
        {isMazePage && mazeHost ? createPortal(<MazePage />, mazeHost) : null}
      </AppProviders>
    </AppErrorBoundary>
  );
}
