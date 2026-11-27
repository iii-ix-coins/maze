import { createRoot } from 'react-dom/client';
import { App } from './app/App';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Required React mount element #root was not found.');
}

// One React root owns the site shell, every route and the persistent Maze surface.
createRoot(root).render(<App />);
