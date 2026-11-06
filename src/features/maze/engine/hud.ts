// Moved verbatim from legacy/mazeV3/maze-game/maze.js (statements 91, 93, 94). Only imports/exports and `S.` state access were added.
import { hudCache, S, cam } from './state';
import { hudSteps, hudTime, hudGoals, miniTile, zoomLabel, hintCount, followBtn, hintBtn } from './dom';
export const fmtTime = ms => { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
export function setHud(el, key, val) {
    if (hudCache[key] !== val) { hudCache[key] = val; el.textContent = val; }
}
export function updateHud() {
    setHud(hudSteps, 's', S.steps);
    setHud(hudTime, 't', fmtTime(S.startTime === null ? 0 : (S.endTime !== null ? S.endTime : (S.pausedAt !== null ? S.pausedAt : performance.now())) - S.startTime));
    setHud(hudGoals, 'g', S.goals + '/' + S.goalTotal);
    const mt = cam.tz > 1.02;
    if (hudCache.m !== mt) { hudCache.m = mt; miniTile.classList.toggle('show', mt); }
    setHud(zoomLabel, 'z', Math.round(cam.tz * 100) + '%');
    setHud(hintCount, 'h', S.hintsLeft);
    if (hudCache.f !== cam.follow) { hudCache.f = cam.follow; followBtn.setAttribute('aria-pressed', String(cam.follow)); }
    hintBtn.disabled = S.hintsLeft <= 0 || S.isGameOver;
}
