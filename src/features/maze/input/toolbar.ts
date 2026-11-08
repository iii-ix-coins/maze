// Moved verbatim from legacy/mazeV3/maze-game/maze.js (statements 135, 136, 137, 138, 139, 140, 141, 142, 143). Only imports/exports and `S.` state access were added.
import { applyMazeTheme } from '../engine/theme';
import { $, followBtn, fogBtn, hintBtn } from '../engine/dom';
import { zoomBy, resetView } from '../engine/camera';
import { ZOOM_STEP } from '../engine/constants';
import { cam } from '../engine/state';
import { toggleFog, useHint } from '../engine/solo';

export function initToolbar() {
document.addEventListener('click', (event: any) => {
    const button = event.target.closest && event.target.closest('.theme-option[data-theme]');
    if (button) applyMazeTheme(button.dataset.theme);
});
try { applyMazeTheme(localStorage.getItem('maze-color-theme') || 'grass', false); } catch (_) { applyMazeTheme('grass', false); }
$('zoomIn').addEventListener('click', () => zoomBy(ZOOM_STEP));
$('zoomOut').addEventListener('click', () => zoomBy(1 / ZOOM_STEP));
$('zoomReset').addEventListener('click', resetView);
followBtn.addEventListener('click', () => { cam.follow = !cam.follow; if (cam.follow) cam.anchor = null; });
fogBtn.addEventListener('click', toggleFog);
hintBtn.addEventListener('click', useHint);
document.addEventListener('click', (e: any) => { const b = e.target.closest && e.target.closest('button'); if (b) b.blur(); });
}
