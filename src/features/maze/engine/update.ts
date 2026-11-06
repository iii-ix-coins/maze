// Moved verbatim from legacy/mazeV3/maze-game/maze.js (statements 87, 88). Only imports/exports and `S.` state access were added.
import { reduceMotion } from './dom';
import { S, racerPos, padVec, cam, confetti } from './state';
import { PAD_SPEED } from './constants';
import { panWorld, updateCamera } from './camera';
import { updateHud } from './hud';
/** Every other racer glides between cells instead of jumping; a spectator's camera rides on the focused one. */
export function smoothRacers(dt) {
    const k = reduceMotion ? 1 : 1 - Math.exp(-dt * 18);
    const live = new Set();
    for (const p of S.multiplayerPlayers) {
        const tr = (p.position / S.SIZE) | 0, tc = p.position % S.SIZE;
        live.add(p.id);
        let s = racerPos.get(p.id);
        if (!s) { s = { r: tr, c: tc }; racerPos.set(p.id, s); continue; }
        s.r += (tr - s.r) * k; s.c += (tc - s.c) * k;
        if (Math.abs(tr - s.r) < 0.002) s.r = tr;
        if (Math.abs(tc - s.c) < 0.002) s.c = tc;
    }
    if (racerPos.size > live.size) for (const id of racerPos.keys()) if (!live.has(id)) racerPos.delete(id);
}
export function update(dt) {
    if (S.multiplayerSession) smoothRacers(dt);
    const tr = (S.player / S.SIZE) | 0, tc = S.player % S.SIZE, k = 1 - Math.exp(-dt * 24);
    const focus = S.spectating && racerPos.get(S.spectatorFocus);
    if (focus) {
        S.drawR = focus.r; S.drawC = focus.c;
    } else {
        S.drawR += (tr - S.drawR) * k;
        S.drawC += (tc - S.drawC) * k;
        if (Math.abs(tr - S.drawR) < 0.002) S.drawR = tr;
        if (Math.abs(tc - S.drawC) < 0.002) S.drawC = tc;
    }
    const kd = Math.exp(-dt * 16);
    S.kickX *= kd; S.kickY *= kd;
    if (Math.abs(S.kickX) < 0.001) S.kickX = 0;
    if (Math.abs(S.kickY) < 0.001) S.kickY = 0;
    S.pop *= Math.exp(-dt * 9);
    if (S.introT < 1) S.introT = Math.min(1, S.introT + dt / 0.9);
    const pm = Math.hypot(padVec.x, padVec.y);
    if (pm > 0.1) {
        const sp = PAD_SPEED * ((pm - 0.1) / 0.9) * dt / (S.base * cam.z);
        panWorld((padVec.x / pm) * sp, (padVec.y / pm) * sp);
    }
    updateCamera(dt);
    for (let i = confetti.length - 1; i >= 0; i--) {
        const p = confetti[i];
        p.vy += 16 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        p.life -= dt;
        if (p.life <= 0) confetti.splice(i, 1);
    }
    updateHud();
}
