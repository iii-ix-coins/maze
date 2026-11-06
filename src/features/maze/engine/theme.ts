// Moved verbatim from legacy/mazeV3/maze-game/maze.js (statements 23). Only imports/exports and `S.` state access were added.
import { MAZE_THEMES } from './constants';
import { S } from './state';
import { buildMini, draw } from './render';
export function applyMazeTheme(theme, persist = true) {
    if (!MAZE_THEMES[theme]) theme = 'grass';
    S.activeTheme = theme;
    S.WALL_COLOR = MAZE_THEMES[theme].wall;
    S.BOARD_COLOR = MAZE_THEMES[theme].board;
    document.documentElement.dataset.mazeTheme = theme;
    document.querySelectorAll<HTMLElement>('.theme-option').forEach(button => {
        const selected = button.dataset.theme === theme;
        button.setAttribute('aria-pressed', String(selected));
        button.classList.toggle('is-active', selected);
    });
    if (persist) { try { localStorage.setItem('maze-color-theme', theme); } catch (_) { } }
    if (S.wallPath) buildMini();
    if (typeof draw === 'function') draw(performance.now());
}
