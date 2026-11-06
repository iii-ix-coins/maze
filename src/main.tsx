import { createRoot } from 'react-dom/client';
import { App } from './app/App';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Required React mount element #root was not found.');
}

// One React root. MazePage is rendered through a portal into #maze-root so the
// original body-level DOM order and CSS selectors remain unchanged.
createRoot(root).render(<App />);
