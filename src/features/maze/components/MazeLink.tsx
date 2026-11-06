import type { ReactNode } from 'react';
import { MAZE_DOCUMENT_URL } from '../maze-routes';

export function MazeLink({ children = 'Play Maze' }: { children?: ReactNode }) {
  return <a href={MAZE_DOCUMENT_URL}>{children}</a>;
}
