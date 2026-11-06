// Moved verbatim from legacy/mazeV3/maze-game/maze.js (statements 155, 156, 157, 158, 159, 162, 163, 164, 166, 167, 168). Only imports/exports and `S.` state access were added.
import { padEl, knobEl, padWrap, stage, padGrip } from '../engine/dom';
import { padVec, S } from '../engine/state';
import { clamp } from '@maze/shared';
import { PAD_M } from '../engine/constants';
export function padPoint(e) {
    const r = padEl.getBoundingClientRect(), max = r.width / 2 - knobEl.offsetWidth / 2;
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > max) { dx *= max / len; dy *= max / len; }
    knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
    padVec.x = dx / max; padVec.y = dy / max;
}
export function padReset() {
    padVec.x = padVec.y = 0;
    knobEl.style.transform = '';
    padEl.classList.remove('dragging');
    padWrap.classList.remove('active');
    S.padId = null;
}
export function padFree() {
    if (padWrap.classList.contains('docked')) return { w: 1, h: 1 };
    return {
        w: Math.max(1, stage.clientWidth - padWrap.offsetWidth - 2 * PAD_M),
        h: Math.max(1, stage.clientHeight - padWrap.offsetHeight - 2 * PAD_M)
    };
}
export function placePad() {
    if (padWrap.classList.contains('docked')) return;
    const f = padFree();
    padWrap.style.left = PAD_M + S.padPos.x * f.w + 'px';
    padWrap.style.top = PAD_M + S.padPos.y * f.h + 'px';
}

export function initJoystick() {
padEl.addEventListener('pointerdown', (e) => {
    S.padId = e.pointerId;
    padEl.setPointerCapture(e.pointerId);
    padEl.classList.add('dragging');
    padWrap.classList.add('active');
    padPoint(e);
});
padEl.addEventListener('pointermove', (e) => { if (e.pointerId === S.padId) padPoint(e); });
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    padEl.addEventListener(ev, (e: any) => { if (e.pointerId === S.padId) padReset(); });
}
try {
    const s = JSON.parse(localStorage.getItem('mazePadPos'));
    if (s && isFinite(s.x) && isFinite(s.y)) S.padPos = { x: clamp(s.x, 0, 1), y: clamp(s.y, 0, 1) };
} catch (_) { }
padGrip.addEventListener('pointerdown', (e) => {
    S.gripId = e.pointerId;
    padGrip.setPointerCapture(e.pointerId);
    const r = padWrap.getBoundingClientRect();
    S.gripOffX = e.clientX - r.left; S.gripOffY = e.clientY - r.top;
    padWrap.classList.add('active');
    e.preventDefault();
});
padGrip.addEventListener('pointermove', (e) => {
    if (e.pointerId !== S.gripId) return;
    const s = stage.getBoundingClientRect(), f = padFree();
    S.padPos.x = clamp((e.clientX - s.left - S.gripOffX - PAD_M) / f.w, 0, 1);
    S.padPos.y = clamp((e.clientY - s.top - S.gripOffY - PAD_M) / f.h, 0, 1);
    placePad();
});
for (const ev of ['pointerup', 'pointercancel']) {
    padGrip.addEventListener(ev, (e: any) => {
        if (e.pointerId !== S.gripId) return;
        S.gripId = null;
        padWrap.classList.remove('active');
        const f = padFree();
        const d = [S.padPos.x * f.w, (1 - S.padPos.x) * f.w, S.padPos.y * f.h, (1 - S.padPos.y) * f.h];
        const m = d.indexOf(Math.min(...d));
        if (m === 0) S.padPos.x = 0; else if (m === 1) S.padPos.x = 1;
        else if (m === 2) S.padPos.y = 0; else S.padPos.y = 1;
        placePad();
        try { localStorage.setItem('mazePadPos', JSON.stringify(S.padPos)); } catch (_) { }
    });
}
}
