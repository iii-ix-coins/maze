// Moved verbatim from legacy/mazeV3/maze-game/maze.js (statements 135, 136, 137, 138, 139, 140, 141, 142, 143). Only imports/exports and `S.` state access were added.
import { applyMazeTheme } from '../engine/theme';
import { $, followBtn, fogBtn, hintBtn } from '../engine/dom';
import { zoomBy, resetView } from '../engine/camera';
import { ZOOM_STEP } from '../engine/constants';
import { cam } from '../engine/state';
import { toggleFog, useHint } from '../engine/solo';

export function initToolbar(signal: AbortSignal) {
document.addEventListener('click', (event: any) => {
    const button = event.target.closest && event.target.closest('.theme-option[data-theme]');
    if (button) applyMazeTheme(button.dataset.theme);
}, { signal });
try { applyMazeTheme(localStorage.getItem('maze-color-theme') || 'grass', false); } catch (_) { applyMazeTheme('grass', false); }
$('zoomIn').addEventListener('click', () => zoomBy(ZOOM_STEP), { signal });
$('zoomOut').addEventListener('click', () => zoomBy(1 / ZOOM_STEP), { signal });
$('zoomReset').addEventListener('click', resetView, { signal });
followBtn.addEventListener('click', () => { cam.follow = !cam.follow; if (cam.follow) cam.anchor = null; }, { signal });
fogBtn.addEventListener('click', toggleFog, { signal });
hintBtn.addEventListener('click', useHint, { signal });
document.addEventListener('click', (e: any) => { const b = e.target.closest && e.target.closest('button'); if (b) b.blur(); }, { signal });
}
