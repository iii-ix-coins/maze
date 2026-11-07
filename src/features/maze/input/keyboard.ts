// Moved verbatim from legacy/mazeV3/maze-game/maze.js (statements 134). Only imports/exports and `S.` state access were added.
import { confirmEl } from '../engine/dom';
import { cancelEnd, askEnd } from '../engine/session';
import { S, cam } from '../engine/state';
import { ARROWS, ZOOM_STEP } from '../engine/constants';
import { movePlayer, toggleFog, useHint } from '../engine/solo';
import { zoomBy, resetView } from '../engine/camera';

export function initKeyboard() {
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && confirmEl.classList.contains('show')) { cancelEnd(); return; }
    const t: any = e.target;
    if (t && t.closest && t.closest('input, textarea, select, [contenteditable="true"], [role="slider"], #createGame')) return;
    if (!S.isGameOver && (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.code === 'KeyR'))) { e.preventDefault(); askEnd(); return; }
    if (Object.prototype.hasOwnProperty.call(ARROWS, e.key)) {
        e.preventDefault();
        movePlayer(ARROWS[e.key]);
        return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    switch (e.code) {
        case 'Equal': case 'NumpadAdd': zoomBy(ZOOM_STEP); break;
        case 'Minus': case 'NumpadSubtract': zoomBy(1 / ZOOM_STEP); break;
        case 'Digit0': case 'Numpad0': resetView(); break;
        case 'KeyC': cam.follow = !cam.follow; if (cam.follow) cam.anchor = null; break;
        case 'KeyF': toggleFog(); break;
        case 'KeyH': useHint(); break;
    }
});
}
