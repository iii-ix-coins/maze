// Moved verbatim from legacy/mazeV3/maze-game/maze.js (statements 75, 76, 89, 90). Only imports/exports and `S.` state access were added.
import { S, cam, reveal, collected, racerPos, confetti } from './state';
import { miniCanvas, miniLayer, mctx, mazeCanvas, reduceMotion, miniCtx } from './dom';
import { clamp } from '@maze/shared';
import { WALL_PX, HINT_MS, EXIT_COLOR, EXIT_R, PLAYER_R, TORCH_RADIUS, PLAYER_COLOR } from './constants';
export function buildWalls() {
    const p = new Path2D();
    for (let r = 0; r <= S.SIZE; r++) {
        let run = -1;
        for (let c = 0; c <= S.SIZE; c++) {
            const wall = c < S.SIZE && (r === 0 || r === S.SIZE || !(S.open[(r - 1) * S.SIZE + c] & 4));
            if (wall && run < 0) run = c;
            if (!wall && run >= 0) { p.moveTo(run, r); p.lineTo(c, r); run = -1; }
        }
    }
    for (let c = 0; c <= S.SIZE; c++) {
        let run = -1;
        for (let r = 0; r <= S.SIZE; r++) {
            const wall = r < S.SIZE && (c === 0 || c === S.SIZE || !(S.open[r * S.SIZE + c - 1] & 2));
            if (wall && run < 0) run = r;
            if (!wall && run >= 0) { p.moveTo(c, run); p.lineTo(c, r); run = -1; }
        }
    }
    S.wallPath = p;
}
export function buildMini() {
    const M = S.miniM;
    S.miniScale = (M - 2 * S.miniPad) / S.SIZE;
    for (const cv of [miniCanvas, miniLayer]) { cv.width = cv.height = Math.round(M * S.dpr); }
    miniCanvas.style.width = miniCanvas.style.height = M + 'px';
    const g = miniLayer.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, miniLayer.width, miniLayer.height);
    g.setTransform(S.dpr * S.miniScale, 0, 0, S.dpr * S.miniScale, S.dpr * S.miniPad, S.dpr * S.miniPad);
    g.fillStyle = S.BOARD_COLOR;
    g.fillRect(0, 0, S.SIZE, S.SIZE);
    g.strokeStyle = S.WALL_COLOR;
    g.lineWidth = 1 / S.miniScale;
    g.lineCap = 'square';
    g.stroke(S.wallPath);
}
export function draw(t) {
    if (!S.wallPath) return;
    const ctx = mctx, time = t / 1000;
    const s = S.base * cam.z;
    const tx = Math.round((S.V / 2 - cam.cx * s) * S.dpr) / S.dpr;
    const ty = Math.round((S.V / 2 - cam.cy * s) * S.dpr) / S.dpr;
    const world = () => ctx.setTransform(S.dpr * s, 0, 0, S.dpr * s, tx * S.dpr, ty * S.dpr);
    const ease = 1 - Math.pow(1 - S.introT, 3);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, mazeCanvas.width, mazeCanvas.height);
    world();
    ctx.fillStyle = S.BOARD_COLOR;
    ctx.fillRect(0, 0, S.SIZE, S.SIZE);
    const vg = ctx.createRadialGradient(S.SIZE / 2, S.SIZE / 2, S.SIZE * 0.1, S.SIZE / 2, S.SIZE / 2, S.SIZE * 0.78);
    vg.addColorStop(0, S.activeTheme === 'light' ? 'rgba(0,0,0,0.015)' : 'rgba(255,255,255,0.10)');
    vg.addColorStop(1, S.activeTheme === 'light' ? 'rgba(0,0,0,0.035)' : 'rgba(0,0,0,0.22)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, S.SIZE, S.SIZE);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = 0.46;
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.stroke(S.trailPath);
    ctx.globalAlpha = ease;
    ctx.lineWidth = clamp(WALL_PX * Math.sqrt(cam.z), WALL_PX * 0.7, WALL_PX * 2.4) / s;
    ctx.lineCap = 'square'; ctx.lineJoin = 'miter';
    ctx.strokeStyle = S.WALL_COLOR;
    ctx.stroke(S.wallPath);
    ctx.globalAlpha = 1;
    const pxw = S.drawC + 0.5 + S.kickX, pyw = S.drawR + 0.5 + S.kickY;
    if (S.hint) {
        const age = performance.now() - S.hint.t0;
        if (age > HINT_MS) S.hint = null;
        else {
            ctx.save();
            ctx.globalAlpha = Math.min(1, (HINT_MS - age) / 700);
            ctx.strokeStyle = '#ffd24a';
            ctx.lineWidth = 0.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            ctx.setLineDash([0.5, 0.4]);
            ctx.lineDashOffset = -time * 2.2;
            ctx.shadowColor = '#ffd24a'; ctx.shadowBlur = 8 * S.dpr;
            ctx.beginPath();
            ctx.moveTo(pxw, pyw);
            for (let i = 1; i < S.hint.cells.length; i++) {
                const c = S.hint.cells[i];
                ctx.lineTo((c % S.SIZE) + 0.5, ((c / S.SIZE) | 0) + 0.5);
            }
            ctx.stroke();
            ctx.restore();
        }
    }
    if (S.revealed) {
        ctx.save();
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.globalAlpha = 0.9;
        reveal.forEach((r, i) => {
            ctx.lineWidth = 0.36 - 0.03 * i;
            ctx.strokeStyle = r.color;
            ctx.stroke(r.path);
        });
        ctx.restore();
    }
    const sx0 = (S.startCell % S.SIZE) + 0.5, sy0 = ((S.startCell / S.SIZE) | 0) + 0.5;
    ctx.beginPath();
    ctx.arc(sx0, sy0, 0.4 * ease, 0, Math.PI * 2);
    ctx.strokeStyle = S.playerColor;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1.6 / s;
    ctx.stroke();
    ctx.globalAlpha = 1;
    for (let i = 0; i < S.exits.length; i++) {
        const ex = (S.exits[i] % S.SIZE) + 0.5, ey = ((S.exits[i] / S.SIZE) | 0) + 0.5;
        const locked = i > S.goals;
        const targetColor = locked ? '#435447' : EXIT_COLOR;
        if (collected[i]) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(ex, ey, EXIT_R * 0.55, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(114, 255, 139, 0.23)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(167,255,179,0.8)';
            ctx.lineWidth = 0.07;
            ctx.stroke();
            ctx.font = 'bold 0.42px Poppins, Tahoma, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#caffd0';
            ctx.fillText('✓', ex, ey + 0.01);
            ctx.restore();
            continue;
        }
        if (!reduceMotion && !locked) {
            for (let k = 0; k < 2; k++) {
                const ph = (time * 0.8 + k * 0.5 + i * 0.13) % 1;
                ctx.beginPath();
                ctx.arc(ex, ey, EXIT_R * 0.7 + ph * 0.95, 0, Math.PI * 2);
                ctx.strokeStyle = targetColor;
                ctx.globalAlpha = (1 - ph) * (i === S.goals ? 0.62 : 0.33) * ease;
                ctx.lineWidth = 2 / s;
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
        }
        if (S.goalPingIndex === i && !reduceMotion) {
            const ping = Math.min(1, (performance.now() - S.goalPingAt) / 850);
            if (ping < 1) {
                ctx.beginPath();
                ctx.arc(ex, ey, EXIT_R + 0.25 + ping * 1.15, 0, Math.PI * 2);
                ctx.strokeStyle = '#c6ff82';
                ctx.globalAlpha = (1 - ping) * 0.9;
                ctx.lineWidth = 0.11 * (1 - ping) + 0.025;
                ctx.stroke();
                ctx.globalAlpha = 1;
            } else S.goalPingIndex = -1;
        }
        ctx.save();
        ctx.translate(ex, ey);
        if (!reduceMotion && !locked) ctx.rotate(time * 0.9);
        ctx.scale(ease, ease);
        ctx.shadowColor = targetColor;
        ctx.shadowBlur = locked ? 0 : (i === S.goals ? 10 : 4) * S.dpr;
        ctx.fillStyle = targetColor;
        ctx.beginPath();
        ctx.moveTo(0, -EXIT_R); ctx.lineTo(EXIT_R, 0); ctx.lineTo(0, EXIT_R); ctx.lineTo(-EXIT_R, 0);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = locked ? 'rgba(220,240,222,0.45)' : '#fff';
        ctx.lineWidth = 1.6 / s;
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.restore();
        ctx.save();
        const label = String(i + 1);
        // Two-digit targets (10–99) use a smaller face so the number stays inside the diamond.
        ctx.font = `700 ${label.length > 1 ? 0.3 : 0.42}px Poppins, Tahoma, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = locked ? '#c4d1c6' : '#fff';
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.lineWidth = 0.04;
        ctx.strokeText(label, ex, ey + 0.01);
        ctx.fillText(label, ex, ey + 0.01);
        ctx.restore();
    }
    if (!S.revealed && !S.fogOn && !S.spectating) {
        ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
        const fs = clamp(s * 0.6, 11, 18);
        ctx.font = `700 ${fs}px Poppins, Tahoma, sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineJoin = 'round'; ctx.lineWidth = 3;
        ctx.globalAlpha = ease;
        for (let i = 0; i < S.exits.length; i++) {
            const left = S.exitDists[i][S.player];
            if (collected[i] || left <= 0) continue;
            // With many targets only the active one gets a distance counter; the rest would bury the maze.
            if (S.exits.length > 9 && i !== S.goals) continue;
            const sx = tx + ((S.exits[i] % S.SIZE) + 0.5) * s, sy = ty + (((S.exits[i] / S.SIZE) | 0) + 0.5) * s;
            const txt = String(left);
            const col = i === S.goals ? (left <= 10 ? '#ffd24a' : '#eaffeb') : '#a2b3a5';
            let lx, ly;
            if (sx >= 0 && sx <= S.V && sy >= 0 && sy <= S.V) {
                const r = EXIT_R * s + 2;
                lx = clamp(sx, 14, S.V - 14);
                if (sy < S.V / 2) { ctx.textBaseline = 'top'; ly = clamp(sy + r, 2, S.V - fs - 4); }
                else { ctx.textBaseline = 'bottom'; ly = clamp(sy - r, fs + 4, S.V - 2); }
            } else {
                const dx = sx - S.V / 2, dy = sy - S.V / 2;
                const k = (S.V / 2 - 24) / Math.max(Math.abs(dx), Math.abs(dy));
                lx = S.V / 2 + dx * k; ly = S.V / 2 + dy * k;
                ctx.textBaseline = 'middle';
                ctx.save();
                ctx.translate(lx, ly);
                ctx.rotate(Math.atan2(dy, dx));
                ctx.beginPath();
                ctx.moveTo(21, 0); ctx.lineTo(14, -5); ctx.lineTo(14, 5);
                ctx.closePath();
                ctx.fillStyle = col;
                ctx.fill();
                ctx.restore();
            }
            ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText(txt, lx, ly);
            ctx.fillStyle = col; ctx.fillText(txt, lx, ly);
        }
        ctx.globalAlpha = 1;
        world();
    }
    if (S.multiplayerSession) {
        // Glow is expensive on canvas; big crowds are drawn flat.
        const crowd = S.multiplayerPlayers.length > 12;
        for (let n = 0; n < S.multiplayerPlayers.length; n++) {
            const other = S.multiplayerPlayers[n];
            if (other.id === S.localPlayerId || other.connected === false) continue;
            const glide = racerPos.get(other.id);
            const ox = (glide ? glide.c : other.position % S.SIZE) + 0.5;
            const oy = (glide ? glide.r : (other.position / S.SIZE) | 0) + 0.5;
            const radius = PLAYER_R * 0.9;
            ctx.save();
            if (S.spectating && other.id === S.spectatorFocus) {
                // A soft ring marks the racer the camera is following.
                ctx.beginPath();
                ctx.arc(ox, oy, radius + 0.2 + (reduceMotion ? 0 : 0.05 * Math.sin(time * 5)), 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(255,255,255,0.85)';
                ctx.lineWidth = 2 / s;
                ctx.stroke();
            }
            if (!crowd) { ctx.shadowColor = other.color || '#62c7ff'; ctx.shadowBlur = 8 * S.dpr; }
            ctx.fillStyle = other.color || '#62c7ff';
            ctx.beginPath();
            ctx.arc(ox, oy, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.lineWidth = 1.5 / s;
            ctx.strokeStyle = '#fff';
            ctx.stroke();
            if (!crowd || s > 22) {
                const tag = String(n + 1);
                ctx.font = `700 ${tag.length > 1 ? 0.2 : 0.28}px Poppins, Tahoma, sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#061008';
                ctx.fillText(tag, ox, oy + 0.01);
            }
            ctx.restore();
        }
    }
    if (!S.spectating) {
        const pr = PLAYER_R * (1 + (reduceMotion ? 0 : 0.06 * Math.sin(time * 6)) + 0.28 * S.pop);
        ctx.save();
        ctx.shadowColor = S.playerColor; ctx.shadowBlur = 12 * S.dpr;
        ctx.fillStyle = S.playerColor;
        ctx.beginPath();
        ctx.arc(pxw, pyw, pr, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.8 / s;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath();
        ctx.arc(pxw - pr * 0.3, pyw - pr * 0.32, pr * 0.26, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
    if (S.fogOn && !S.isGameOver) {
        ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
        const fx = tx + pxw * s, fy = ty + pyw * s, r1 = TORCH_RADIUS * s;
        const fg = ctx.createRadialGradient(fx, fy, r1 * 0.35, fx, fy, r1);
        fg.addColorStop(0, 'rgba(0,0,0,0)');
        fg.addColorStop(1, 'rgba(0,0,0,0.94)');
        ctx.fillStyle = fg;
        ctx.fillRect(0, 0, S.V, S.V);
        world();
    }
    for (const p of confetti) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, p.life / 0.6);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
}
export function drawMini() {
    if (!S.wallPath) return;
    const g = miniCtx, torch = S.fogOn && !S.isGameOver;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, miniCanvas.width, miniCanvas.height);
    g.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    if (!torch) g.drawImage(miniLayer, 0, 0, S.miniM, S.miniM);
    g.translate(S.miniPad, S.miniPad);
    g.scale(S.miniScale, S.miniScale);
    if (torch) {
        g.fillStyle = 'rgba(0,0,0,0.55)';
        g.fillRect(0, 0, S.SIZE, S.SIZE);
        g.lineCap = 'round'; g.lineJoin = 'round';
        g.lineWidth = 0.9; g.strokeStyle = 'rgba(255,255,255,0.45)';
        g.stroke(S.trailPath);
    }
    const dot = (cell, color, r) => {
        g.beginPath();
        g.arc((cell % S.SIZE) + 0.5, ((cell / S.SIZE) | 0) + 0.5, r / S.miniScale, 0, Math.PI * 2);
        g.fillStyle = color; g.fill();
        g.lineWidth = 1 / S.miniScale; g.strokeStyle = '#fff'; g.stroke();
    };
    if (!torch) S.exits.forEach((c, i) => { if (!collected[i]) dot(c, EXIT_COLOR, 3.2); });
    if (S.multiplayerSession) {
        // The others show up as small dots in their own colours; with a crowd they stay tiny.
        const small = S.multiplayerPlayers.length > 12 ? 1.6 : 2.4;
        for (const other of S.multiplayerPlayers) {
            if (other.id === S.localPlayerId || other.connected === false || other.id === S.spectatorFocus) continue;
            dot(other.position, other.color || '#62c7ff', small);
        }
    }
    if (S.spectating) {
        const focused = S.multiplayerPlayers.find(p => p.id === S.spectatorFocus);
        if (focused) dot(focused.position, focused.color || PLAYER_COLOR, 3.6);
    } else dot(S.player, PLAYER_COLOR, 3.2);
    const vw = S.V / (S.base * cam.z);
    g.beginPath();
    g.rect(cam.cx - vw / 2, cam.cy - vw / 2, vw, vw);
    g.fillStyle = 'rgba(255,255,255,0.14)'; g.fill();
    g.lineWidth = 1.6 / S.miniScale; g.strokeStyle = '#fff'; g.stroke();
    g.setTransform(1, 0, 0, 1, 0, 0);
}
