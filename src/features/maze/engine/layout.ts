// Moved verbatim from legacy/mazeV3/maze-game/maze.js (statements 27, 73, 74). Only imports/exports and `S.` state access were added.
import { bfs as bfsOnGrid, getGrid, MAX_GOALS, clamp } from '@maze/shared';
import { S } from './state';
import { PANEL_W, VIEW_MARGIN } from './constants';
import { $, padDock, stageEl, mazeCanvas } from './dom';
import { buildMini } from './render';
import { placePad } from '../input/joystick';
export const bfs = (o, src, dist, prev) => bfsOnGrid(S.grid, o, src, dist, prev);
/** Re-points the board-size dependent state (grid tables, buffers) at a new maze size. */
export function applyMazeSize(size) {
    if (size === S.SIZE && S.open.length === S.N) return;
    S.grid = getGrid(size);
    S.SIZE = S.grid.SIZE; S.N = S.grid.N; S.NB = S.grid.NB;
    S.open = new Uint8Array(S.N);
    S.exitDists = Array.from({ length: MAX_GOALS }, () => new Int32Array(S.N));
    S.dStart = new Int32Array(S.N);
    S.prevStart = new Int32Array(S.N);
    S.wallPath = null;
}
export function fitLayout() {
    S.dpr = window.devicePixelRatio || 1;
    // Site shell owns the viewport. Size the board against the shared route
    // content rectangle so no Maze state can spill under the site header/dock.
    const app = document.getElementById('mazeApp');
    // Use the shared route viewport's content box for height. #mazeApp may be
    // taller than the viewport while the Create / Rooms menu is in normal flow.
    const surface = app?.parentElement;
    const isSharedSurface = surface?.classList.contains('feature-page-shell') === true;
    const surfaceStyle = isSharedSurface ? window.getComputedStyle(surface) : null;
    const verticalPadding = surfaceStyle
        ? (Number.parseFloat(surfaceStyle.paddingTop) || 0) + (Number.parseFloat(surfaceStyle.paddingBottom) || 0)
        : 0;
    const appBounds = app?.getBoundingClientRect();
    const viewportHeight = isSharedSurface
        ? surface.clientHeight - verticalPadding
        : appBounds?.height;
    const w = Math.max(1, Math.floor(appBounds?.width || window.innerWidth));
    const h = Math.max(1, Math.floor(viewportHeight || window.innerHeight));
    const wide = w >= 640 && w / h > 1.1;
    const side = wide
        ? Math.min(w - PANEL_W - 14 - 28, h - 84)
        : Math.min(w - 20, h - 232);
    S.V = clamp(Math.floor(side / 2) * 2, 180, 960);
    app?.classList.toggle('wide', wide);
    const joystick = $('padWrap');
    if (wide) {
        if (joystick.parentElement !== padDock) padDock.appendChild(joystick);
        joystick.classList.add('docked');
    } else {
        if (joystick.parentElement !== stageEl) stageEl.appendChild(joystick);
        joystick.classList.remove('docked');
    }
    app?.style.setProperty('--v', S.V + 'px');
    S.base = Math.max(6, Math.floor((S.V - 2 * VIEW_MARGIN) / S.SIZE));
    mazeCanvas.style.width = mazeCanvas.style.height = S.V + 'px';
    mazeCanvas.width = mazeCanvas.height = Math.round(S.V * S.dpr);
    S.miniM = clamp(Math.round(S.V * 0.26), 76, 140);
    if (S.wallPath) buildMini();
    placePad();
}
