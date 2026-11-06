// Moved verbatim from legacy/mazeV3/maze-game/maze.js (statements 6, 8, 10, 12, 14, 15, 16, 17, 18, 19, 20, 21, 62, 133, 160). Only imports/exports and `S.` state access were added.

export const WALL_PX = 2.5;
export const PLAYER_COLOR = '#ff0000';
export const EXIT_COLOR = '#0400ff';
export const MAZE_THEMES = { grass: { wall: '#063b14', board: '#168b2b' }, light: { wall: '#080b09', board: '#f5f7f4' }, dark: { wall: '#f4f7f4', board: '#050706' } };
export const PLAYER_R = 0.32;
export const EXIT_R = 0.40;
export const ZOOM_MIN = 1, ZOOM_MAX = 5, ZOOM_STEP = 1.25;
export const VIEW_MARGIN = 4;
export const PANEL_W = 176;
export const PAD_SPEED = 620;
export const HINTS_PER_MAZE = 3, HINT_LEN = 14, HINT_MS = 3500;
export const TORCH_RADIUS = 4.5;
export const SAVE_KEY = 'mazeSave';
export const ARROWS = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 };
export const PAD_M = 6;
