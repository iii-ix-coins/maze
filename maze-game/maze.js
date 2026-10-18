/**
 * Maze game runtime.
 * Rendering, input, HUD and solo gameplay stay here; generation and online transport
 * are independent modules to keep their responsibilities separate.
 */
import { SIZE, MAX_GOALS, N, DR, DC, NB, rnd, clamp, bfs, generateMazeData } from './core/maze-generator.js';
import { MazeMultiplayerClient } from './multiplayer-client.js';
import { ModeMenuComponent, GoalMenuComponent, WaitingRoomComponent, RaceBoardComponent } from './ui-components.js';

const WALL_PX = 2.5;
const WALL_COLOR = 'rgb(0, 0, 0)';
const PLAYER_COLOR = '#ff0000';
let playerColor = PLAYER_COLOR;
const EXIT_COLOR = '#0400ff';
const BOARD_COLOR = 'green';
const PLAYER_R = 0.32;
const EXIT_R = 0.40;
const ZOOM_MIN = 1, ZOOM_MAX = 5, ZOOM_STEP = 1.25;
const VIEW_MARGIN = 4;
const PANEL_W = 176;
const PAD_SPEED = 620;
const HINTS_PER_MAZE = 3, HINT_LEN = 14, HINT_MS = 3500;
const TORCH_RADIUS = 4.5;
const $ = id => document.getElementById(id);
const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
let open = new Uint8Array(N);
let startCell = 0;
let exits = [];
let player = 0;
let isGameOver = true;
const mazeCanvas = $('maze');
const messageElement = $('message');

const mctx = mazeCanvas.getContext('2d');
const miniCanvas = $('mini'), miniCtx = miniCanvas.getContext('2d');
const miniLayer = document.createElement('canvas');
const winCard = $('winCard'), winStats = $('winStats');
const hudSteps = $('hudSteps'), hudTime = $('hudTime'), zoomLabel = $('zoomLabel');
const hintCount = $('hintCount'), hintBtn = $('hintBtn'), fogBtn = $('fogBtn'), followBtn = $('followBtn');
let V = 640;
let base = 15;
let dpr = 1;
let miniM = 150, miniPad = 5, miniScale = 3;
const cam = { z: 1, cx: SIZE / 2, cy: SIZE / 2, tz: 1, tcx: SIZE / 2, tcy: SIZE / 2, follow: true, anchor: null };
let wallPath = null, trailPath = null;
let solutionLen = 0, steps = 0, startTime = null, endTime = null;
let hintsLeft = 0, hintsUsed = 0, hint = null;
let drawR = 0, drawC = 0, kickX = 0, kickY = 0, pop = 0;
let fogOn = false, introT = 1;
const confetti = [];
const exitDists = Array.from({ length: MAX_GOALS }, () => new Int32Array(N));
const collected = new Uint8Array(MAX_GOALS);
let goals = 0, goalTotal = 3, pausedAt = null, revealed = false;
const reveal = [];
const dStart = new Int32Array(N), prevStart = new Int32Array(N);
const hudGoals = $('hudGoals'), menuEl = $('menu'), confirmEl = $('confirm'), banner = $('banner');
const miniTile = $('miniTile'), confirmTitle = $('confirmTitle'), confirmText = $('confirmText');
const stageEl = $('stage'), padDock = $('padDock');
const modeMenu = new ModeMenuComponent($('playerModeMenu'));
const goalMenu = new GoalMenuComponent(menuEl);
const waitingRoom = new WaitingRoomComponent($('waitingMenu'));
const raceBoard = new RaceBoardComponent($('raceBoard'), $('raceList'));
const SAVE_KEY = 'mazeSave';
let moves = '', mazeCode = '';
let selectedPlayerCount = 1, selectedGoalCount = 3;
let multiplayerQueued = false, multiplayerSession = false;
let multiplayerRoomId = '', localPlayerId = '', multiplayerPlayers = [];
let multiplayerWinnerId = '', multiplayerWinnerName = '';
let goalPingIndex = -1, goalPingAt = 0;
let lobbyCounts = {};
const multiplayerClient = new MazeMultiplayerClient({
    onMessage: handleMultiplayerMessage,
    onStatus: handleNetworkStatus
});
function fitLayout() {
    dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth, h = window.innerHeight;
    const wide = w >= 640 && w / h > 1.1;
    const side = wide
        ? Math.min(w - PANEL_W - 14 - 28, h - 84)
        : Math.min(w - 20, h - 232);
    V = clamp(Math.floor(side / 2) * 2, 240, 960);
    document.body.classList.toggle('wide', wide);
    const joystick = $('padWrap');
    if (wide) {
        if (joystick.parentElement !== padDock) padDock.appendChild(joystick);
        joystick.classList.add('docked');
    } else {
        if (joystick.parentElement !== stageEl) stageEl.appendChild(joystick);
        joystick.classList.remove('docked');
    }
    document.documentElement.style.setProperty('--v', V + 'px');
    base = Math.max(6, Math.floor((V - 2 * VIEW_MARGIN) / SIZE));
    mazeCanvas.style.width = mazeCanvas.style.height = V + 'px';
    mazeCanvas.width = mazeCanvas.height = Math.round(V * dpr);
    miniM = clamp(Math.round(V * 0.26), 76, 140);
    if (wallPath) buildMini();
    placePad();
}
function buildWalls() {
    const p = new Path2D();
    for (let r = 0; r <= SIZE; r++) {
        let run = -1;
        for (let c = 0; c <= SIZE; c++) {
            const wall = c < SIZE && (r === 0 || r === SIZE || !(open[(r - 1) * SIZE + c] & 4));
            if (wall && run < 0) run = c;
            if (!wall && run >= 0) { p.moveTo(run, r); p.lineTo(c, r); run = -1; }
        }
    }
    for (let c = 0; c <= SIZE; c++) {
        let run = -1;
        for (let r = 0; r <= SIZE; r++) {
            const wall = r < SIZE && (c === 0 || c === SIZE || !(open[r * SIZE + c - 1] & 2));
            if (wall && run < 0) run = r;
            if (!wall && run >= 0) { p.moveTo(c, run); p.lineTo(c, r); run = -1; }
        }
    }
    wallPath = p;
}
function buildMini() {
    const M = miniM;
    miniScale = (M - 2 * miniPad) / SIZE;
    for (const cv of [miniCanvas, miniLayer]) { cv.width = cv.height = Math.round(M * dpr); }
    miniCanvas.style.width = miniCanvas.style.height = M + 'px';
    const g = miniLayer.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, miniLayer.width, miniLayer.height);
    g.setTransform(dpr * miniScale, 0, 0, dpr * miniScale, dpr * miniPad, dpr * miniPad);
    g.fillStyle = BOARD_COLOR;
    g.fillRect(0, 0, SIZE, SIZE);
    g.strokeStyle = WALL_COLOR;
    g.lineWidth = 1 / miniScale;
    g.lineCap = 'square';
    g.stroke(wallPath);
}
function clampCam(tight, target) {
    const z = target ? cam.tz : cam.z;
    const vw = V / (base * z);
    let cx = target ? cam.tcx : cam.cx, cy = target ? cam.tcy : cam.cy;
    const pad = 0.8, lo = vw / 2 - pad, hi = SIZE - vw / 2 + pad;
    cx = lo > hi ? SIZE / 2 : clamp(cx, lo, hi);
    cy = lo > hi ? SIZE / 2 : clamp(cy, lo, hi);
    if (target) { cam.tcx = cx; cam.tcy = cy; } else { cam.cx = cx; cam.cy = cy; }
}
function zoomAt(newZ, sx, sy) {
    newZ = clamp(newZ, ZOOM_MIN, ZOOM_MAX);
    if (newZ === cam.tz) return;
    if (!cam.follow) {
        const s = base * cam.z;
        cam.anchor = { sx, sy, wx: cam.cx + (sx - V / 2) / s, wy: cam.cy + (sy - V / 2) / s };
    }
    cam.tz = newZ;
}
const zoomBy = f => zoomAt(cam.tz * f, V / 2, V / 2);
function resetView() {
    cam.follow = true;
    cam.anchor = null;
    cam.tz = 1;
    cam.tcx = cam.tcy = SIZE / 2;
}
function panWorld(dx, dy) {
    cam.follow = false;
    cam.anchor = null;
    cam.tcx += dx; cam.tcy += dy;
    clampCam(false, true);
    cam.cx = cam.tcx; cam.cy = cam.tcy;
}
const panByPixels = (dx, dy) => panWorld(-dx / (base * cam.z), -dy / (base * cam.z));
function ensurePlayerVisible() {
    if (cam.follow) return;
    const vw = V / (base * cam.tz), m = Math.min(3, vw * 0.2);
    const px = (player % SIZE) + 0.5, py = ((player / SIZE) | 0) + 0.5;
    const l = cam.tcx - vw / 2 + m, r = cam.tcx + vw / 2 - m, t = cam.tcy - vw / 2 + m, b = cam.tcy + vw / 2 - m;
    if (px < l) cam.tcx -= l - px; else if (px > r) cam.tcx += px - r;
    if (py < t) cam.tcy -= t - py; else if (py > b) cam.tcy += py - b;
    clampCam(false, true);
}
function updateCamera(dt) {
    if (cam.follow) {
        cam.anchor = null;
        cam.tcx = drawC + 0.5;
        cam.tcy = drawR + 0.5;
        clampCam(true, true);
    }
    cam.z += (cam.tz - cam.z) * (1 - Math.exp(-dt * 11));
    if (Math.abs(cam.tz - cam.z) < 0.0008) cam.z = cam.tz;
    if (cam.anchor) {
        const a = cam.anchor;
        cam.cx = a.wx - (a.sx - V / 2) / (base * cam.z);
        cam.cy = a.wy - (a.sy - V / 2) / (base * cam.z);
        cam.tcx = a.wx - (a.sx - V / 2) / (base * cam.tz);
        cam.tcy = a.wy - (a.sy - V / 2) / (base * cam.tz);
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
const padVec = { x: 0, y: 0 };
function update(dt) {
    const tr = (player / SIZE) | 0, tc = player % SIZE, k = 1 - Math.exp(-dt * 24);
    drawR += (tr - drawR) * k;
    drawC += (tc - drawC) * k;
    if (Math.abs(tr - drawR) < 0.002) drawR = tr;
    if (Math.abs(tc - drawC) < 0.002) drawC = tc;
    const kd = Math.exp(-dt * 16);
    kickX *= kd; kickY *= kd;
    if (Math.abs(kickX) < 0.001) kickX = 0;
    if (Math.abs(kickY) < 0.001) kickY = 0;
    pop *= Math.exp(-dt * 9);
    if (introT < 1) introT = Math.min(1, introT + dt / 0.9);
    const pm = Math.hypot(padVec.x, padVec.y);
    if (pm > 0.1) {
        const sp = PAD_SPEED * ((pm - 0.1) / 0.9) * dt / (base * cam.z);
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
function draw(t) {
    if (!wallPath) return;
    const ctx = mctx, time = t / 1000;
    const s = base * cam.z;
    const tx = Math.round((V / 2 - cam.cx * s) * dpr) / dpr;
    const ty = Math.round((V / 2 - cam.cy * s) * dpr) / dpr;
    const world = () => ctx.setTransform(dpr * s, 0, 0, dpr * s, tx * dpr, ty * dpr);
    const ease = 1 - Math.pow(1 - introT, 3);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, mazeCanvas.width, mazeCanvas.height);
    world();
    ctx.fillStyle = BOARD_COLOR;
    ctx.fillRect(0, 0, SIZE, SIZE);
    const vg = ctx.createRadialGradient(SIZE / 2, SIZE / 2, SIZE * 0.1, SIZE / 2, SIZE / 2, SIZE * 0.78);
    vg.addColorStop(0, 'rgba(255,255,255,0.10)');
    vg.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = 0.46;
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.stroke(trailPath);
    ctx.globalAlpha = ease;
    ctx.lineWidth = clamp(WALL_PX * Math.sqrt(cam.z), WALL_PX * 0.7, WALL_PX * 2.4) / s;
    ctx.lineCap = 'square'; ctx.lineJoin = 'miter';
    ctx.strokeStyle = WALL_COLOR;
    ctx.stroke(wallPath);
    ctx.globalAlpha = 1;
    const pxw = drawC + 0.5 + kickX, pyw = drawR + 0.5 + kickY;
    if (hint) {
        const age = performance.now() - hint.t0;
        if (age > HINT_MS) hint = null;
        else {
            ctx.save();
            ctx.globalAlpha = Math.min(1, (HINT_MS - age) / 700);
            ctx.strokeStyle = '#ffd24a';
            ctx.lineWidth = 0.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            ctx.setLineDash([0.5, 0.4]);
            ctx.lineDashOffset = -time * 2.2;
            ctx.shadowColor = '#ffd24a'; ctx.shadowBlur = 8 * dpr;
            ctx.beginPath();
            ctx.moveTo(pxw, pyw);
            for (let i = 1; i < hint.cells.length; i++) {
                const c = hint.cells[i];
                ctx.lineTo((c % SIZE) + 0.5, ((c / SIZE) | 0) + 0.5);
            }
            ctx.stroke();
            ctx.restore();
        }
    }
    if (revealed) {
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
    const sx0 = (startCell % SIZE) + 0.5, sy0 = ((startCell / SIZE) | 0) + 0.5;
    ctx.beginPath();
    ctx.arc(sx0, sy0, 0.4 * ease, 0, Math.PI * 2);
    ctx.strokeStyle = playerColor;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1.6 / s;
    ctx.stroke();
    ctx.globalAlpha = 1;
    for (let i = 0; i < exits.length; i++) {
        const ex = (exits[i] % SIZE) + 0.5, ey = ((exits[i] / SIZE) | 0) + 0.5;
        const locked = i > goals;
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
                ctx.globalAlpha = (1 - ph) * (i === goals ? 0.62 : 0.33) * ease;
                ctx.lineWidth = 2 / s;
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
        }
        if (goalPingIndex === i && !reduceMotion) {
            const ping = Math.min(1, (performance.now() - goalPingAt) / 850);
            if (ping < 1) {
                ctx.beginPath();
                ctx.arc(ex, ey, EXIT_R + 0.25 + ping * 1.15, 0, Math.PI * 2);
                ctx.strokeStyle = '#c6ff82';
                ctx.globalAlpha = (1 - ping) * 0.9;
                ctx.lineWidth = 0.11 * (1 - ping) + 0.025;
                ctx.stroke();
                ctx.globalAlpha = 1;
            } else goalPingIndex = -1;
        }
        ctx.save();
        ctx.translate(ex, ey);
        if (!reduceMotion && !locked) ctx.rotate(time * 0.9);
        ctx.scale(ease, ease);
        ctx.shadowColor = targetColor;
        ctx.shadowBlur = locked ? 0 : (i === goals ? 10 : 4) * dpr;
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
        ctx.font = '700 0.42px Poppins, Tahoma, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = locked ? '#c4d1c6' : '#fff';
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.lineWidth = 0.04;
        ctx.strokeText(String(i + 1), ex, ey + 0.01);
        ctx.fillText(String(i + 1), ex, ey + 0.01);
        ctx.restore();
    }
    if (!revealed && !fogOn) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const fs = clamp(s * 0.6, 11, 18);
        ctx.font = `700 ${fs}px Poppins, Tahoma, sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineJoin = 'round'; ctx.lineWidth = 3;
        ctx.globalAlpha = ease;
        for (let i = 0; i < exits.length; i++) {
            const left = exitDists[i][player];
            if (collected[i] || left <= 0) continue;
            const sx = tx + ((exits[i] % SIZE) + 0.5) * s, sy = ty + (((exits[i] / SIZE) | 0) + 0.5) * s;
            const txt = String(left);
            const col = i === goals ? (left <= 10 ? '#ffd24a' : '#eaffeb') : '#a2b3a5';
            let lx, ly;
            if (sx >= 0 && sx <= V && sy >= 0 && sy <= V) {
                const r = EXIT_R * s + 2;
                lx = clamp(sx, 14, V - 14);
                if (sy < V / 2) { ctx.textBaseline = 'top'; ly = clamp(sy + r, 2, V - fs - 4); }
                else { ctx.textBaseline = 'bottom'; ly = clamp(sy - r, fs + 4, V - 2); }
            } else {
                const dx = sx - V / 2, dy = sy - V / 2;
                const k = (V / 2 - 24) / Math.max(Math.abs(dx), Math.abs(dy));
                lx = V / 2 + dx * k; ly = V / 2 + dy * k;
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
    if (multiplayerSession) {
        for (const other of multiplayerPlayers) {
            if (other.id === localPlayerId || other.connected === false) continue;
            const ox = (other.position % SIZE) + 0.5;
            const oy = ((other.position / SIZE) | 0) + 0.5;
            const radius = PLAYER_R * 0.9;
            ctx.save();
            ctx.shadowColor = other.color || '#62c7ff';
            ctx.shadowBlur = 8 * dpr;
            ctx.fillStyle = other.color || '#62c7ff';
            ctx.beginPath();
            ctx.arc(ox, oy, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.lineWidth = 1.5 / s;
            ctx.strokeStyle = '#fff';
            ctx.stroke();
            ctx.font = '700 0.28px Poppins, Tahoma, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#061008';
            ctx.fillText(String(Math.max(1, multiplayerPlayers.findIndex(p => p.id === other.id) + 1)), ox, oy + 0.01);
            ctx.restore();
        }
    }
    const pr = PLAYER_R * (1 + (reduceMotion ? 0 : 0.06 * Math.sin(time * 6)) + 0.28 * pop);
    ctx.save();
    ctx.shadowColor = playerColor; ctx.shadowBlur = 12 * dpr;
    ctx.fillStyle = playerColor;
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
    if (fogOn && !isGameOver) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const fx = tx + pxw * s, fy = ty + pyw * s, r1 = TORCH_RADIUS * s;
        const fg = ctx.createRadialGradient(fx, fy, r1 * 0.35, fx, fy, r1);
        fg.addColorStop(0, 'rgba(0,0,0,0)');
        fg.addColorStop(1, 'rgba(0,0,0,0.94)');
        ctx.fillStyle = fg;
        ctx.fillRect(0, 0, V, V);
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
function drawMini() {
    if (!wallPath) return;
    const g = miniCtx, torch = fogOn && !isGameOver;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, miniCanvas.width, miniCanvas.height);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!torch) g.drawImage(miniLayer, 0, 0, miniM, miniM);
    g.translate(miniPad, miniPad);
    g.scale(miniScale, miniScale);
    if (torch) {
        g.fillStyle = 'rgba(0,0,0,0.55)';
        g.fillRect(0, 0, SIZE, SIZE);
        g.lineCap = 'round'; g.lineJoin = 'round';
        g.lineWidth = 0.9; g.strokeStyle = 'rgba(255,255,255,0.45)';
        g.stroke(trailPath);
    }
    const dot = (cell, color, r) => {
        g.beginPath();
        g.arc((cell % SIZE) + 0.5, ((cell / SIZE) | 0) + 0.5, r / miniScale, 0, Math.PI * 2);
        g.fillStyle = color; g.fill();
        g.lineWidth = 1 / miniScale; g.strokeStyle = '#fff'; g.stroke();
    };
    if (!torch) exits.forEach((c, i) => { if (!collected[i]) dot(c, EXIT_COLOR, 3.2); });
    dot(player, PLAYER_COLOR, 3.2);
    const vw = V / (base * cam.z);
    g.beginPath();
    g.rect(cam.cx - vw / 2, cam.cy - vw / 2, vw, vw);
    g.fillStyle = 'rgba(255,255,255,0.14)'; g.fill();
    g.lineWidth = 1.6 / miniScale; g.strokeStyle = '#fff'; g.stroke();
    g.setTransform(1, 0, 0, 1, 0, 0);
}
const fmtTime = ms => { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const hudCache = {};
function setHud(el, key, val) {
    if (hudCache[key] !== val) { hudCache[key] = val; el.textContent = val; }
}
function updateHud() {
    setHud(hudSteps, 's', steps);
    setHud(hudTime, 't', fmtTime(startTime === null ? 0 : (endTime !== null ? endTime : (pausedAt !== null ? pausedAt : performance.now())) - startTime));
    setHud(hudGoals, 'g', goals + '/' + goalTotal);
    const mt = cam.tz > 1.02;
    if (hudCache.m !== mt) { hudCache.m = mt; miniTile.classList.toggle('show', mt); }
    setHud(zoomLabel, 'z', Math.round(cam.tz * 100) + '%');
    setHud(hintCount, 'h', hintsLeft);
    if (hudCache.f !== cam.follow) { hudCache.f = cam.follow; followBtn.setAttribute('aria-pressed', String(cam.follow)); }
    hintBtn.disabled = hintsLeft <= 0 || isGameOver;
}
function movePlayer(d) {
    if (isGameOver || pausedAt !== null) return;
    if (multiplayerQueued && !multiplayerSession) return;
    if (multiplayerSession) {
        if (!multiplayerWinnerId) multiplayerClient.move(d);
        return;
    }
    if (open[player] & (1 << d)) {
        player = NB[player * 4 + d];
        steps++;
        moves += d;
        if (startTime === null) startTime = performance.now();
        trailPath.lineTo((player % SIZE) + 0.5, ((player / SIZE) | 0) + 0.5);
        pop = 1;
        ensurePlayerVisible();
        checkGoal();
        saveGame();
    } else {
        kickX = DC[d] * 0.14;
        kickY = DR[d] * 0.14;
    }
}
function checkGoal() {
    const i = exits.indexOf(player);
    // A target can only be collected when it is the next target in sequence.
    if (i < 0 || collected[i] || i !== goals) return;
    collected[i] = 1;
    goals++;
    goalPingIndex = goals < goalTotal ? goals : -1;
    goalPingAt = performance.now();
    if (goals < goalTotal) {
        if (!reduceMotion) burst(player, 30);
        return;
    }
    isGameOver = true;
    clearSave();
    endTime = performance.now();
    messageElement.textContent = "🏆 You Win";
    const eff = Math.min(100, Math.round(100 * solutionLen / Math.max(1, steps)));
    const item = (v, l) => `<div><b>${v}</b><span>${l}</span></div>`;
    winStats.innerHTML = item(steps, 'گام') + item(solutionLen, 'The shortest way') + item(eff + '%', 'Efficiency')
        + item(fmtTime(endTime - startTime), 'time') + (hintsUsed ? item(hintsUsed, 'Guide') : '');
    winCard.classList.add('show');
    if (!reduceMotion) {
        burst(player, 90);
        setTimeout(() => burst(player, 90), 320);
    }
    cam.follow = true;
    cam.anchor = null;
    cam.tz = 1;
    updateHud();
}
function burst(cell, n) {
    const x = (cell % SIZE) + 0.5, y = ((cell / SIZE) | 0) + 0.5;
    const colors = [playerColor, EXIT_COLOR, '#ffd24a', '#ffffff', '#7cfc9a'];
    for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 11;
        confetti.push({
            x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 6,
            rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14,
            w: 0.14 + Math.random() * 0.14, h: 0.08 + Math.random() * 0.07,
            color: colors[rnd(colors.length)], life: 1.2 + Math.random() * 1.1
        });
    }
}
function useHint() {
    if (isGameOver || pausedAt !== null || hintsLeft <= 0) return;
    let bi = -1;
    for (let i = 0; i < exits.length; i++) {
        if (i === goals && !collected[i]) { bi = i; break; }
    }
    if (bi < 0) return;
    const dd = exitDists[bi], target = exits[bi];
    const cells = [player];
    let cur = player;
    for (let i = 0; i < HINT_LEN && cur !== target; i++) {
        let nxt = -1;
        for (let d = 0; d < 4 && nxt < 0; d++) {
            if (open[cur] & (1 << d)) {
                const v = NB[cur * 4 + d];
                if (dd[v] < dd[cur]) nxt = v;
            }
        }
        if (nxt < 0) break;
        cur = nxt;
        cells.push(cur);
    }
    hint = { cells, t0: performance.now() };
    hintsLeft--;
    hintsUsed++;
    updateHud();
    saveGame();
}
function toggleFog() {
    fogOn = !fogOn;
    fogBtn.setAttribute('aria-pressed', String(fogOn));
}
function orderedRouteLength() {
    if (!exits.length) return 0;
    let total = exitDists[0][startCell];
    for (let i = 1; i < exits.length; i++) total += exitDists[i][exits[i - 1]];
    return Math.max(0, total);
}
function buildReveal() {
    bfs(open, startCell, dStart, prevStart);
    reveal.length = 0;
    exits.forEach((cell, i) => {
        const cells = [];
        for (let v = cell; v !== -1; v = prevStart[v]) cells.push(v);
        const path = new Path2D();
        for (let k = cells.length - 1; k >= 0; k--) {
            const x = (cells[k] % SIZE) + 0.5, y = ((cells[k] / SIZE) | 0) + 0.5;
            if (k === cells.length - 1) path.moveTo(x, y); else path.lineTo(x, y);
        }
        reveal.push({ path, color: `hsl(${Math.round(i * 360 / exits.length)}, 90%, 62%)` });
    });
}
function saveGame() {
    if (isGameOver || multiplayerQueued || multiplayerSession) return;
    try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({
            maze: mazeCode, start: startCell, exits, moves, hintsLeft, hintsUsed,
            elapsed: startTime === null ? null : (pausedAt !== null ? pausedAt : performance.now()) - startTime
        }));
    } catch (_) { }
}
function clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (_) { }
}
function loadSave() {
    try {
        const v = JSON.parse(localStorage.getItem(SAVE_KEY));
        if (v && typeof v.maze === 'string' && v.maze.length === N && Array.isArray(v.exits) && v.exits.length >= 1
            && v.exits.length <= MAX_GOALS && typeof v.moves === 'string') return v;
    } catch (_) { }
    return null;
}
function setConfirm(resume) {
    if (resume) {
        confirmTitle.textContent = 'Unfinished game found';
        confirmText.textContent = 'You left a game in progress. Continue it, or end it and see the shortest paths?';
    } else if (multiplayerSession) {
        confirmTitle.textContent = 'Leave this race?';
        confirmText.textContent = 'Your racer will leave the live match. Other connected players can continue the race.';
    } else {
        confirmTitle.textContent = 'End current game?';
        confirmText.textContent = 'The game will stop and the shortest paths from the start to every point will be shown.';
    }
}
function showMenu() {
    if (multiplayerSession) multiplayerClient.leaveRoom();
    else if (multiplayerQueued) {
        if (multiplayerRoomId) multiplayerClient.leaveRoom();
        else multiplayerClient.leaveQueue();
    }
    multiplayerSession = false;
    multiplayerQueued = false;
    multiplayerRoomId = '';
    localPlayerId = '';
    multiplayerPlayers = [];
    multiplayerWinnerId = '';
    multiplayerWinnerName = '';
    raceBoard.hide();
    waitingRoom.hide();
    goalMenu.hide();
    winCard.classList.remove('show');
    banner.classList.remove('show');
    confirmEl.classList.remove('show');
    modeMenu.show();
}
function askEnd() {
    if (isGameOver) return;
    setConfirm(false);
    if (pausedAt === null) pausedAt = performance.now();
    confirmEl.classList.add('show');
}
function cancelEnd() {
    if (pausedAt !== null && startTime !== null) startTime += performance.now() - pausedAt;
    pausedAt = null;
    confirmEl.classList.remove('show');
    saveGame();
}
function confirmEnd() {
    confirmEl.classList.remove('show');
    const endingMultiplayer = multiplayerSession || multiplayerQueued;
    if (multiplayerSession) multiplayerClient.leaveRoom();
    else if (multiplayerQueued) {
        if (multiplayerRoomId) multiplayerClient.leaveRoom();
        else multiplayerClient.leaveQueue();
    }
    multiplayerSession = false;
    multiplayerQueued = false;
    multiplayerRoomId = '';
    multiplayerWinnerId = '';
    raceBoard.hide();
    isGameOver = true;
    // Ending a race must not erase a previously saved solo run or reveal its map as a solo result.
    if (endingMultiplayer) {
        pausedAt = null;
        showMenu();
        return;
    }
    clearSave();
    endTime = pausedAt !== null ? pausedAt : performance.now();
    pausedAt = null;
    buildReveal();
    revealed = true;
    banner.textContent = 'Game ended – shortest paths from the start to every point';
    banner.classList.add('show');
    cam.follow = true;
    cam.anchor = null;
    cam.tz = 1;
    updateHud();
}
function newMaze() {
    if (isGameOver) showMenu(); else askEnd();
}
function resetUi() {
    isGameOver = false;
    pausedAt = null;
    revealed = false;
    reveal.length = 0;
    messageElement.textContent = "";
    winCard.classList.remove('show');
    modeMenu.hide();
    goalMenu.hide();
    waitingRoom.hide();
    confirmEl.classList.remove('show');
    banner.classList.remove('show');
    document.body.classList.remove('in-menu');
    fitLayout();
}
function beginScene() {
    mazeCode = Array.from(open, v => v.toString(16)).join('');
    for (let i = 0; i < exits.length; i++) bfs(open, exits[i], exitDists[i], null);
    solutionLen = orderedRouteLength();
    collected.fill(0);
    goals = 0;
    player = startCell;
    steps = 0; moves = '';
    startTime = endTime = null;
    hintsLeft = HINTS_PER_MAZE; hintsUsed = 0; hint = null;
    goalPingIndex = -1; goalPingAt = 0;
    confetti.length = 0;
    drawR = (player / SIZE) | 0; drawC = player % SIZE;
    kickX = kickY = pop = 0;
    buildWalls();
    buildMini();
    trailPath = new Path2D();
    trailPath.moveTo(drawC + 0.5, drawR + 0.5);
    cam.follow = true; cam.anchor = null;
    cam.tz = 1; cam.tcx = cam.tcy = SIZE / 2;
    if (reduceMotion) { introT = 1; cam.z = 1; cam.cx = cam.cy = SIZE / 2; }
    else { introT = 0; cam.z = 2.6; cam.cx = drawC + 0.5; cam.cy = drawR + 0.5; }
    clampCam(true, false);
    padReset();
    updateHud();
}
function initGame(count) {
    goalTotal = count || goalTotal;
    if (!multiplayerQueued && !multiplayerSession) playerColor = PLAYER_COLOR;
    multiplayerPlayers = [];
    raceBoard.hide();
    resetUi();
    const generated = generateMazeData(goalTotal);
    open = generated.open;
    startCell = generated.startCell;
    exits = generated.exits;
    beginScene();
    if (!multiplayerQueued && !multiplayerSession) saveGame();
}
function restoreGame(v) {
    resetUi();
    open = Uint8Array.from(v.maze, c => parseInt(c, 16));
    startCell = v.start;
    exits = v.exits.slice();
    goalTotal = exits.length;
    beginScene();
    for (const ch of v.moves) {
        const d = +ch;
        if (!(d >= 0 && d < 4) || !(open[player] & (1 << d))) break;
        player = NB[player * 4 + d];
        steps++;
        moves += ch;
        trailPath.lineTo((player % SIZE) + 0.5, ((player / SIZE) | 0) + 0.5);
        const i = exits.indexOf(player);
        if (i === goals && !collected[i]) { collected[i] = 1; goals++; }
    }
    drawR = (player / SIZE) | 0; drawC = player % SIZE;
    introT = 1; cam.z = 1; cam.cx = cam.cy = SIZE / 2;
    hintsLeft = typeof v.hintsLeft === 'number' ? v.hintsLeft : HINTS_PER_MAZE;
    hintsUsed = typeof v.hintsUsed === 'number' ? v.hintsUsed : 0;
    if (typeof v.elapsed === 'number') startTime = performance.now() - v.elapsed;
    pausedAt = performance.now();
    setConfirm(true);
    confirmEl.classList.add('show');
    updateHud();
}

/* ──────────────────────────────────────────────────────────────────────────
   Lobby orchestration. Components own rendering; this layer connects them to
   game state and the independently hosted room server.
   ────────────────────────────────────────────────────────────────────────── */
function getMultiplayerUrl() {
    let saved = '';
    try { saved = localStorage.getItem('mazeMultiplayerUrl') || ''; } catch (_) {}
    if (saved.trim()) return saved.trim();

    const meta = document.querySelector('meta[name="maze-multiplayer-url"]');
    const configured = meta ? meta.content.trim() : '';
    if (configured) return configured;

    // Zero-configuration local testing: the bundled Node server listens on port 8080.
    // Do not guess a remote endpoint on production hosts; those still require an explicit URL.
    const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
    if (localHosts.has(location.hostname) && location.protocol !== 'file:') {
        return 'ws://127.0.0.1:8080';
    }
    return '';
}
function handleNetworkStatus(state, message) {
    modeMenu.setNetworkStatus(state, message);
    const hint = $('serverConfigHint');
    if (hint) {
        hint.textContent = state === 'online'
            ? 'Connected. Live waiting counts and online races are enabled.'
            : state === 'connecting'
                ? 'Connecting to the multiplayer server…'
                : (getMultiplayerUrl()
                    ? 'Server is unreachable. Check the URL and make sure the server is running.'
                    : 'The single-player mode works without a server. Configure a WebSocket URL for online races.');
    }
    if (state === 'offline' && multiplayerQueued && !multiplayerSession && $('waitingMenu').classList.contains('show') && getMultiplayerUrl()) {
        multiplayerQueued = false;
        isGameOver = true;
        waitingRoom.setMessage('Server unavailable', 'Could not connect to the matchmaking server. Check the WebSocket URL and try again.', true);
    } else if (state === 'offline' && multiplayerSession) {
        banner.textContent = 'Connection lost — this race can no longer sync. Return to the lobby to start a new match.';
        banner.classList.add('show');
    } else if (state === 'online' && multiplayerSession && banner.textContent.startsWith('Connection lost')) {
        banner.classList.remove('show');
    }
}
function selectPlayerMode(players) {
    selectedPlayerCount = Number(players);
    modeMenu.hide();
    if (selectedPlayerCount === 1) {
        multiplayerQueued = false;
        multiplayerSession = false;
        selectedGoalCount = 3;
        goalMenu.show(1);
        return;
    }
    goalMenu.show(selectedPlayerCount);
    goalMenu.updateWaitingCounts(lobbyCounts);
}
function queueForRace(goalsCount) {
    selectedGoalCount = Number(goalsCount);
    if (selectedPlayerCount <= 1) {
        multiplayerQueued = false;
        multiplayerSession = false;
        initGame(selectedGoalCount);
        return;
    }

    const url = getMultiplayerUrl();
    waitingRoom.show(selectedPlayerCount, selectedGoalCount);
    goalMenu.hide();
    modeMenu.hide();
    raceBoard.hide();
    multiplayerSession = false;
    multiplayerQueued = false;
    multiplayerRoomId = '';
    localPlayerId = '';
    multiplayerWinnerId = '';
    multiplayerPlayers = [];
    isGameOver = true;

    if (!url) {
        waitingRoom.setMessage(
            'Online server not configured',
            'The lobby UI is ready, but online waiting counts require the Maze WebSocket server. Open server settings and enter its wss:// URL.',
            true
        );
        return;
    }
    multiplayerQueued = true;
    multiplayerClient.connect(url);
    const name = $('playerName').value.trim() || 'Player';
    multiplayerClient.joinQueue(selectedPlayerCount, selectedGoalCount, name);
}
function openServerSettings() {
    waitingRoom.hide();
    modeMenu.show();
    const details = $('serverConfig');
    if (details) details.open = true;
    $('serverUrlInput').focus();
}
function handleLobbyCounts(counts) {
    lobbyCounts = counts || {};
    modeMenu.updateWaitingCounts(lobbyCounts);
    goalMenu.updateWaitingCounts(lobbyCounts);
}
function prepareHostedMaze(message) {
    multiplayerRoomId = message.roomId || multiplayerRoomId;
    selectedGoalCount = Number(message.goals || selectedGoalCount);
    multiplayerQueued = true;
    waitingRoom.hide();
    initGame(selectedGoalCount);
    banner.textContent = 'Shared maze generated · synchronizing the race…';
    banner.classList.add('show');
    const accepted = multiplayerClient.publishMaze({
        maze: mazeCode,
        start: startCell,
        exits: exits.slice(),
        goalTotal
    });
    if (!accepted) {
        waitingRoom.setMessage('Connection lost', 'The shared maze could not be sent to the server. Please return to the lobby and retry.', true);
        isGameOver = true;
    }
}
function startMultiplayerGame(message) {
    const map = message.maze;
    if (!map || typeof map.maze !== 'string' || map.maze.length !== N || !Array.isArray(map.exits)) {
        waitingRoom.setMessage('Invalid race map', 'The server sent invalid maze data. Please return to the lobby.', true);
        return;
    }
    multiplayerQueued = false;
    multiplayerSession = true;
    multiplayerRoomId = message.roomId || '';
    localPlayerId = message.ownPlayerId || '';
    selectedPlayerCount = Array.isArray(message.players) ? message.players.length : selectedPlayerCount;
    selectedGoalCount = Number(message.goalCount || map.goalCount || map.exits.length);
    multiplayerWinnerId = '';
    multiplayerWinnerName = '';
    multiplayerPlayers = Array.isArray(message.players) ? message.players : [];
    playerColor = multiplayerPlayers.find(item => item.id === localPlayerId)?.color || PLAYER_COLOR;

    resetUi();
    open = Uint8Array.from(map.maze, c => parseInt(c, 16));
    startCell = Number(map.start);
    exits = map.exits.slice();
    goalTotal = selectedGoalCount;
    beginScene();
    startTime = performance.now() - Math.max(0, Date.now() - Number(message.startedAt || Date.now()));
    endTime = null;
    const roomCode = $('raceRoomCode');
    if (roomCode) roomCode.textContent = `ROOM ${multiplayerRoomId.slice(0, 5).toUpperCase()}`;
    raceBoard.render(multiplayerPlayers, localPlayerId, goalTotal);
    updateHud();
}
function applyMultiplayerUpdate(message) {
    if (!multiplayerSession || !Array.isArray(message.players)) return;
    multiplayerPlayers = message.players;
    const me = multiplayerPlayers.find(item => item.id === localPlayerId);
    if (me) {
        const oldGoals = goals;
        player = Number(me.position);
        steps = Number(me.steps) || 0;
        goals = Number(me.goals) || 0;
        collected.fill(0);
        if (Array.isArray(me.collected)) {
            me.collected.forEach((value, index) => { if (index < collected.length) collected[index] = value ? 1 : 0; });
        }
        if (message.lastMove && message.lastMove.id === localPlayerId) {
            trailPath.lineTo((player % SIZE) + 0.5, ((player / SIZE) | 0) + 0.5);
            ensurePlayerVisible();
            pop = 1;
            if (goals > oldGoals) {
                goalPingIndex = goals < goalTotal ? goals : -1;
                goalPingAt = performance.now();
                if (!reduceMotion) burst(player, 30);
            }
        }
    }
    raceBoard.render(multiplayerPlayers, localPlayerId, goalTotal);
    updateHud();
}
function finishMultiplayerGame(message) {
    if (!multiplayerSession) return;
    if (Array.isArray(message.players)) {
        multiplayerPlayers = message.players;
        const me = multiplayerPlayers.find(item => item.id === localPlayerId);
        if (me) {
            player = Number(me.position);
            steps = Number(me.steps) || steps;
            goals = Number(me.goals) || goals;
            collected.fill(0);
            if (Array.isArray(me.collected)) me.collected.forEach((v, i) => { if (i < collected.length) collected[i] = v ? 1 : 0; });
        }
    }
    multiplayerWinnerId = message.winnerId || '';
    multiplayerWinnerName = message.winnerName || 'Another racer';
    isGameOver = true;
    endTime = performance.now();
    pausedAt = null;
    messageElement.textContent = multiplayerWinnerId === localPlayerId ? '🏆 You win!' : `🏁 ${multiplayerWinnerName} wins`;
    const item = (value, label) => `<div><b>${value}</b><span>${label}</span></div>`;
    winStats.innerHTML = item(steps, 'Steps') + item(`${goals}/${goalTotal}`, 'Targets') +
        item(fmtTime(Math.max(0, endTime - (startTime || endTime))), 'Time');
    winCard.classList.add('show');
    raceBoard.render(multiplayerPlayers, localPlayerId, goalTotal);
    if (!reduceMotion) {
        burst(player, multiplayerWinnerId === localPlayerId ? 100 : 32);
        if (multiplayerWinnerId === localPlayerId) setTimeout(() => burst(player, 70), 320);
    }
    cam.follow = true;
    cam.anchor = null;
    cam.tz = 1;
    updateHud();
}
function handleMultiplayerMessage(message) {
    if (!message || typeof message.type !== 'string') return;
    switch (message.type) {
        case 'lobby:counts':
            handleLobbyCounts(message.counts || {});
            break;
        case 'queue:waiting':
        case 'room:forming':
            multiplayerRoomId = message.roomId || multiplayerRoomId;
            waitingRoom.update(message.waitingPlayers, message.requiredPlayers || message.players);
            break;
        case 'room:host':
            prepareHostedMaze(message);
            break;
        case 'game:start':
            startMultiplayerGame(message);
            break;
        case 'room:update':
            if (message.roomId === multiplayerRoomId) applyMultiplayerUpdate(message);
            break;
        case 'player:blocked': {
            const direction = Number(message.direction);
            if (direction >= 0 && direction < 4) {
                kickX = DC[direction] * 0.14;
                kickY = DR[direction] * 0.14;
            }
            break;
        }
        case 'game:finish':
            if (message.roomId === multiplayerRoomId) finishMultiplayerGame(message);
            break;
        case 'queue:left':
            multiplayerQueued = false;
            waitingRoom.hide();
            showMenu();
            break;
        case 'room:left':
            multiplayerSession = false;
            multiplayerRoomId = '';
            break;
        case 'match:error':
        case 'protocol:error':
            if (multiplayerQueued && !multiplayerSession) {
                multiplayerQueued = false;
                isGameOver = true;
                waitingRoom.setMessage('Matchmaking paused', String(message.message || 'The lobby could not continue.'), true);
            } else {
                banner.textContent = String(message.message || 'Multiplayer error');
                banner.classList.add('show');
            }
            break;
        default:
            break;
    }
}
function configureMultiplayerServer() {
    const input = $('serverUrlInput');
    const raw = String(input.value || '').trim();
    if (!raw) {
        modeMenu.setNetworkStatus('offline', 'Server URL needed');
        $('serverConfigHint').textContent = 'Enter the WebSocket URL from your deployed server.';
        return;
    }
    let parsed;
    try { parsed = new URL(raw); }
    catch (_) {
        $('serverConfigHint').textContent = 'Enter a complete URL starting with ws:// or wss://.';
        return;
    }
    if (!['ws:', 'wss:'].includes(parsed.protocol)) {
        $('serverConfigHint').textContent = 'The URL must start with ws:// or wss://.';
        return;
    }
    if (location.protocol === 'https:' && parsed.protocol !== 'wss:') {
        $('serverConfigHint').textContent = 'This page uses HTTPS, so the server URL must use secure wss://.';
        return;
    }
    try { localStorage.setItem('mazeMultiplayerUrl', raw); } catch (_) {}
    waitingRoom.hide();
    multiplayerClient.connect(raw);
}
function leaveCurrentQueue() {
    if (multiplayerRoomId) multiplayerClient.leaveRoom();
    else multiplayerClient.leaveQueue();
    multiplayerQueued = false;
    waitingRoom.hide();
    showMenu();
}

const ARROWS = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 };
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && confirmEl.classList.contains('show')) { cancelEnd(); return; }
    if (!isGameOver && (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.code === 'KeyR'))) { e.preventDefault(); askEnd(); return; }
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
$('zoomIn').addEventListener('click', () => zoomBy(ZOOM_STEP));
$('zoomOut').addEventListener('click', () => zoomBy(1 / ZOOM_STEP));
$('zoomReset').addEventListener('click', resetView);
followBtn.addEventListener('click', () => { cam.follow = !cam.follow; if (cam.follow) cam.anchor = null; });
fogBtn.addEventListener('click', toggleFog);
hintBtn.addEventListener('click', useHint);
document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('button'); if (b) b.blur(); });
const ptrs = new Map();
let pinchDist = 0;
const swipeStep = () => clamp(base * cam.z * 0.8, 14, 34);
for (const ev of ['touchstart', 'touchmove']) {
    stageEl.addEventListener(ev, (e) => { if (!e.target.closest('button')) e.preventDefault(); }, { passive: false });
}
mazeCanvas.addEventListener('pointerdown', (e) => {
    mazeCanvas.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, ax: e.clientX, ay: e.clientY });
    if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
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
        if (pinchDist > 0) {
            zoomAt(cam.tz * d / pinchDist, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
            cam.z = cam.tz;
            if (cam.anchor) { cam.anchor = null; cam.cx = cam.tcx; cam.cy = cam.tcy; }
        }
        pinchDist = d;
    }
});
for (const ev of ['pointerup', 'pointercancel']) {
    mazeCanvas.addEventListener(ev, (e) => {
        ptrs.delete(e.pointerId);
        if (ptrs.size < 2) pinchDist = 0;
        for (const q of ptrs.values()) { q.ax = q.x; q.ay = q.y; }
    });
}
mazeCanvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = mazeCanvas.getBoundingClientRect();
    zoomAt(cam.tz * Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018)), e.clientX - r.left, e.clientY - r.top);
}, { passive: false });
const padEl = $('pad'), knobEl = $('knob'), padWrap = $('padWrap'), padGrip = $('padGrip');
const stage = stageEl;
let padId = null;
function padPoint(e) {
    const r = padEl.getBoundingClientRect(), max = r.width / 2 - knobEl.offsetWidth / 2;
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > max) { dx *= max / len; dy *= max / len; }
    knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
    padVec.x = dx / max; padVec.y = dy / max;
}
function padReset() {
    padVec.x = padVec.y = 0;
    knobEl.style.transform = '';
    padEl.classList.remove('dragging');
    padWrap.classList.remove('active');
    padId = null;
}
padEl.addEventListener('pointerdown', (e) => {
    padId = e.pointerId;
    padEl.setPointerCapture(e.pointerId);
    padEl.classList.add('dragging');
    padWrap.classList.add('active');
    padPoint(e);
});
padEl.addEventListener('pointermove', (e) => { if (e.pointerId === padId) padPoint(e); });
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    padEl.addEventListener(ev, (e) => { if (e.pointerId === padId) padReset(); });
}
const PAD_M = 6;
let padPos = { x: 1, y: 1 };
try {
    const s = JSON.parse(localStorage.getItem('mazePadPos'));
    if (s && isFinite(s.x) && isFinite(s.y)) padPos = { x: clamp(s.x, 0, 1), y: clamp(s.y, 0, 1) };
} catch (_) { }
function padFree() {
    if (padWrap.classList.contains('docked')) return { w: 1, h: 1 };
    return {
        w: Math.max(1, stage.clientWidth - padWrap.offsetWidth - 2 * PAD_M),
        h: Math.max(1, stage.clientHeight - padWrap.offsetHeight - 2 * PAD_M)
    };
}
function placePad() {
    if (padWrap.classList.contains('docked')) return;
    const f = padFree();
    padWrap.style.left = PAD_M + padPos.x * f.w + 'px';
    padWrap.style.top = PAD_M + padPos.y * f.h + 'px';
}
let gripId = null, gripOffX = 0, gripOffY = 0;
padGrip.addEventListener('pointerdown', (e) => {
    gripId = e.pointerId;
    padGrip.setPointerCapture(e.pointerId);
    const r = padWrap.getBoundingClientRect();
    gripOffX = e.clientX - r.left; gripOffY = e.clientY - r.top;
    padWrap.classList.add('active');
    e.preventDefault();
});
padGrip.addEventListener('pointermove', (e) => {
    if (e.pointerId !== gripId) return;
    const s = stage.getBoundingClientRect(), f = padFree();
    padPos.x = clamp((e.clientX - s.left - gripOffX - PAD_M) / f.w, 0, 1);
    padPos.y = clamp((e.clientY - s.top - gripOffY - PAD_M) / f.h, 0, 1);
    placePad();
});
for (const ev of ['pointerup', 'pointercancel']) {
    padGrip.addEventListener(ev, (e) => {
        if (e.pointerId !== gripId) return;
        gripId = null;
        padWrap.classList.remove('active');
        const f = padFree();
        const d = [padPos.x * f.w, (1 - padPos.x) * f.w, padPos.y * f.h, (1 - padPos.y) * f.h];
        const m = d.indexOf(Math.min(...d));
        if (m === 0) padPos.x = 0; else if (m === 1) padPos.x = 1;
        else if (m === 2) padPos.y = 0; else padPos.y = 1;
        placePad();
        try { localStorage.setItem('mazePadPos', JSON.stringify(padPos)); } catch (_) { }
    });
}
let miniId = null;
function miniTo(e) {
    const r = miniCanvas.getBoundingClientRect();
    cam.follow = false; cam.anchor = null;
    cam.tcx = (e.clientX - r.left - miniPad) / miniScale;
    cam.tcy = (e.clientY - r.top - miniPad) / miniScale;
    clampCam(false, true);
}
miniCanvas.addEventListener('pointerdown', (e) => { miniId = e.pointerId; miniCanvas.setPointerCapture(e.pointerId); miniTo(e); });
miniCanvas.addEventListener('pointermove', (e) => { if (e.pointerId === miniId) miniTo(e); });
for (const ev of ['pointerup', 'pointercancel']) {
    miniCanvas.addEventListener(ev, (e) => { if (e.pointerId === miniId) miniId = null; });
}
for (const b of document.querySelectorAll('.goal-options .opt')) {
    b.addEventListener('click', () => queueForRace(+b.dataset.n));
}
document.querySelectorAll('.mode-choice').forEach(button => {
    button.addEventListener('click', () => selectPlayerMode(+button.dataset.players));
});
$('backToPlayers').addEventListener('click', () => {
    goalMenu.hide();
    modeMenu.show();
});
$('cancelQueue').addEventListener('click', leaveCurrentQueue);
$('waitingOpenSettings').addEventListener('click', openServerSettings);
$('saveServerUrl').addEventListener('click', configureMultiplayerServer);
$('serverUrlInput').addEventListener('keydown', event => {
    if (event.key === 'Enter') configureMultiplayerServer();
});
$('newMazeWin').addEventListener('click', newMaze);
$('newMazePanel').addEventListener('click', newMaze);
$('endYes').addEventListener('click', confirmEnd);
$('endNo').addEventListener('click', cancelEnd);
window.addEventListener('beforeunload', (e) => {
    if (!isGameOver) { e.preventDefault(); e.returnValue = ''; }
});
let resizeTimer = 0;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(fitLayout, 100);
});
let lastT = 0;
function frame(t) {
    const dt = Math.min(0.05, Math.max(0.001, (t - lastT) / 1000));
    lastT = t;
    update(dt);
    draw(t);
    drawMini();
    requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });
window.addEventListener('pagehide', saveGame);
window.onload = () => {
    fitLayout();
    const configuredUrl = getMultiplayerUrl();
    $('serverUrlInput').value = configuredUrl;
    if (configuredUrl) multiplayerClient.connect(configuredUrl);
    else handleNetworkStatus('offline', 'Server URL needed');
    const saved = loadSave();
    if (saved) restoreGame(saved); else showMenu();
    requestAnimationFrame(frame);
};
