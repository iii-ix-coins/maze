import { HomePage } from '../features/home/HomePage';
import { NotFoundPage } from '../components/layout/NotFoundPage';

/** Both the home page and the Maze page share one React/Vite document. */
export function AppRouter() {
  const pathname = window.location.pathname;

  if (pathname === '/' || pathname === '/index.html' || pathname === '/maze.html') {
    return <HomePage />;
  }

  return <NotFoundPage />;
}
