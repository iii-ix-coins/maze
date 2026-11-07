// Moved verbatim from legacy/mazeV3/maze-game/maze.js (statements 77, 78, 79, 80, 81, 82, 83, 84, 85). Only imports/exports and `S.` state access were added.
import { cam, S } from './state';
import { clamp } from '@maze/shared';
import { ZOOM_MIN, ZOOM_MAX } from './constants';
export function mazeFitsView(target = true) {
    const z = target ? cam.tz : cam.z;
    return S.V / (S.base * z) >= S.SIZE;
}
export function clampCam(tight, target) {
    const z = target ? cam.tz : cam.z;
    const vw = S.V / (S.base * z);
    let cx = target ? cam.tcx : cam.cx, cy = target ? cam.tcy : cam.cy;
    if (vw >= S.SIZE) {
        cx = cy = S.SIZE / 2;
    } else {
        const pad = 0.8, lo = vw / 2 - pad, hi = S.SIZE - vw / 2 + pad;
        cx = clamp(cx, lo, hi);
        cy = clamp(cy, lo, hi);
    }
    if (target) { cam.tcx = cx; cam.tcy = cy; } else { cam.cx = cx; cam.cy = cy; }
}
export function zoomAt(newZ, sx, sy) {
    newZ = clamp(newZ, ZOOM_MIN, ZOOM_MAX);
    if (newZ === cam.tz) return;
    if (!cam.follow) {
        const s = S.base * cam.z;
        cam.anchor = { sx, sy, wx: cam.cx + (sx - S.V / 2) / s, wy: cam.cy + (sy - S.V / 2) / s };
    }
    cam.tz = newZ;
}
export const zoomBy = f => zoomAt(cam.tz * f, S.V / 2, S.V / 2);
export function resetView() {
    cam.follow = true;
    cam.anchor = null;
    cam.tz = 1;
    cam.tcx = cam.tcy = S.SIZE / 2;
}
export function panWorld(dx, dy) {
    if (mazeFitsView()) return;
    cam.follow = false;
    cam.anchor = null;
    cam.tcx += dx; cam.tcy += dy;
    clampCam(false, true);
    cam.cx = cam.tcx; cam.cy = cam.tcy;
}
export const panByPixels = (dx, dy) => panWorld(-dx / (S.base * cam.z), -dy / (S.base * cam.z));
export function ensurePlayerVisible() {
    if (cam.follow) return;
    const vw = S.V / (S.base * cam.tz), m = Math.min(3, vw * 0.2);
    const px = (S.player % S.SIZE) + 0.5, py = ((S.player / S.SIZE) | 0) + 0.5;
    const l = cam.tcx - vw / 2 + m, r = cam.tcx + vw / 2 - m, t = cam.tcy - vw / 2 + m, b = cam.tcy + vw / 2 - m;
    if (px < l) cam.tcx -= l - px; else if (px > r) cam.tcx += px - r;
    if (py < t) cam.tcy -= t - py; else if (py > b) cam.tcy += py - b;
    clampCam(false, true);
}
export function updateCamera(dt) {
    if (cam.follow) {
        cam.anchor = null;
        cam.tcx = S.drawC + 0.5;
        cam.tcy = S.drawR + 0.5;
        clampCam(true, true);
    }
    cam.z += (cam.tz - cam.z) * (1 - Math.exp(-dt * 11));
    if (Math.abs(cam.tz - cam.z) < 0.0008) cam.z = cam.tz;
    if (cam.anchor) {
        const a = cam.anchor;
        cam.cx = a.wx - (a.sx - S.V / 2) / (S.base * cam.z);
        cam.cy = a.wy - (a.sy - S.V / 2) / (S.base * cam.z);
        cam.tcx = a.wx - (a.sx - S.V / 2) / (S.base * cam.tz);
        cam.tcy = a.wy - (a.sy - S.V / 2) / (S.base * cam.tz);
        clampCam(false, true);
        if (cam.z === cam.tz) cam.anchor = null;
    } else {
        const k = 1 - Math.exp(-dt * (cam.follow ? 8 : 12));
        cam.cx += (cam.tcx - cam.cx) * k;
        cam.cy += (cam.tcy - cam.cy) * k;
        if (Math.abs(cam.tcx - cam.cx) < 0.0005) cam.cx = cam.tcx;
        if (Math.abs(cam.tcy - cam.cy) < 0.0005) cam.cy = cam.tcy;
    }
    clampCam(cam.follow, false);
}
