// Moved verbatim from legacy/mazeV3/maze-game/maze.js (statements 170, 171, 172, 173). Only imports/exports and `S.` state access were added.
import { mazeFitsView, clampCam } from '../engine/camera';
import { miniCanvas } from '../engine/dom';
import { cam, S } from '../engine/state';
export function miniTo(e) {
    if (mazeFitsView()) return;
    const r = miniCanvas.getBoundingClientRect();
    cam.follow = false; cam.anchor = null;
    cam.tcx = (e.clientX - r.left - S.miniPad) / S.miniScale;
    cam.tcy = (e.clientY - r.top - S.miniPad) / S.miniScale;
    clampCam(false, true);
}

export function initMiniMap() {
miniCanvas.addEventListener('pointerdown', (e) => { S.miniId = e.pointerId; miniCanvas.setPointerCapture(e.pointerId); miniTo(e); });
miniCanvas.addEventListener('pointermove', (e) => { if (e.pointerId === S.miniId) miniTo(e); });
for (const ev of ['pointerup', 'pointercancel']) {
    miniCanvas.addEventListener(ev, (e: any) => { if (e.pointerId === S.miniId) S.miniId = null; });
}
}
