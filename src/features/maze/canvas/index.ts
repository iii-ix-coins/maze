// Canvas rendering remains in the original engine module; React never re-renders per frame.
export { draw, drawMini, buildWalls, buildMini } from '../engine/render';
export { frame } from '../engine/frame';
