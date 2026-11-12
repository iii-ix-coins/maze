// Moved verbatim from legacy/mazeV3/maze-game/maze.js (statements 182). Only imports/exports and `S.` state access were added.
import { S } from './state';
import { update } from './update';
import { draw, drawMini } from './render';
export function frame(t) {
    if (document.hidden) return;
    const dt = Math.min(0.05, Math.max(0.001, (t - S.lastT) / 1000));
    S.lastT = t;
    update(dt);
    draw(t);
    drawMini();
    requestAnimationFrame(frame);
}
