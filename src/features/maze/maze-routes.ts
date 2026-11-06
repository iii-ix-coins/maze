/** Stable public route for the Maze page inside the shared React/Vite application. */
export const MAZE_DOCUMENT_URL = '/maze.html';
export const MAZE_VIEW_URLS = {
  create: '/maze.html?view=create',
  rooms: '/maze.html?view=rooms',
  live: '/maze.html?view=live',
} as const;
