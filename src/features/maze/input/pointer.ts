// Moved verbatim from legacy/mazeV3/maze-game/maze.js (statements 146, 147, 148, 149, 150, 151). Only imports/exports and `S.` state access were added.
import { clamp } from '@maze/shared';
import { S, cam, ptrs } from '../engine/state';
import { stageEl, mazeCanvas } from '../engine/dom';
import { movePlayer } from '../engine/solo';
import { zoomAt } from '../engine/camera';
export const swipeStep = () => clamp(S.base * cam.z * 0.8, 14, 34);

export function initPointer() {
for (const ev of ['touchstart', 'touchmove']) {
    stageEl.addEventListener(ev, (e: any) => { if (!e.target.closest('button')) e.preventDefault(); }, { passive: false });
}
mazeCanvas.addEventListener('pointerdown', (e) => {
    mazeCanvas.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, ax: e.clientX, ay: e.clientY });
    if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        S.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
});
mazeCanvas.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 1) {
        const step = swipeStep();
        for (let guard = 0; guard < 6; guard++) {
            const dx = p.x - p.ax, dy = p.y - p.ay;
            if (Math.max(Math.abs(dx), Math.abs(dy)) < step) break;
            if (Math.abs(dx) > Math.abs(dy)) {
                movePlayer(dx > 0 ? 1 : 3);
                p.ax += dx > 0 ? step : -step;
                p.ay = p.y;
            } else {
                movePlayer(dy > 0 ? 2 : 0);
                p.ay += dy > 0 ? step : -step;
                p.ax = p.x;
            }
        }
    } else if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const r = mazeCanvas.getBoundingClientRect();
        if (S.pinchDist > 0) {
            zoomAt(cam.tz * d / S.pinchDist, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
            cam.z = cam.tz;
            if (cam.anchor) { cam.anchor = null; cam.cx = cam.tcx; cam.cy = cam.tcy; }
        }
        S.pinchDist = d;
    }
});
for (const ev of ['pointerup', 'pointercancel']) {
    mazeCanvas.addEventListener(ev, (e: any) => {
        ptrs.delete(e.pointerId);
        if (ptrs.size < 2) S.pinchDist = 0;
        for (const q of ptrs.values()) { q.ax = q.x; q.ay = q.y; }
    });
}
// Native page scrolling remains the default over the board. Zoom is an explicit
// precision gesture (Ctrl/Cmd + wheel), matching modern map/canvas interaction
// patterns and preventing accidental camera changes while scrolling the page.
mazeCanvas.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;

    e.preventDefault();
    const rect = mazeCanvas.getBoundingClientRect();
    const unit = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16
        : e.deltaMode === WheelEvent.DOM_DELTA_PAGE ? rect.height : 1;
    const delta = e.deltaY * unit;
    const scale = Math.exp(-delta * 0.0018);
    zoomAt(cam.tz * scale, e.clientX - rect.left, e.clientY - rect.top);
}, { passive: false });
}
