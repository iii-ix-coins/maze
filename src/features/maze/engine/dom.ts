// Moved verbatim from legacy/mazeV3/maze-game/maze.js (statements 22, 24, 33, 34, 35, 36, 37, 38, 39, 40, 57, 58, 59, 152, 153). Only imports/exports and `S.` state access were added.
export const $ = (id: string): any => document.getElementById(id);

export const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
export const mazeCanvas = $('maze');

export const mctx = mazeCanvas.getContext('2d');
export const miniCanvas = $('mini'), miniCtx = miniCanvas.getContext('2d');
export const miniLayer = document.createElement('canvas');
export const hintBtn = $('hintBtn'), fogBtn = $('fogBtn'), followBtn = $('followBtn');
export const stageEl = $('stage'), padDock = $('padDock');
export const padEl = $('pad'), knobEl = $('knob'), padWrap = $('padWrap'), padGrip = $('padGrip');
export const stage = stageEl;
