import { getSiteRoutePath } from '../../app/routes';

/** Stable Maze URLs are derived from the shared site route manifest. */
export const MAZE_DOCUMENT_URL = getSiteRoutePath('maze');
export const MAZE_VIEW_URLS = {
  create: `${MAZE_DOCUMENT_URL}?view=create`,
  rooms: `${MAZE_DOCUMENT_URL}?view=rooms`,
  live: `${MAZE_DOCUMENT_URL}?view=live`,
} as const;
