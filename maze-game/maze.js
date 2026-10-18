const SIZE = 42;
const CANDIDATES = 36;
const BRANCH_MIN = 5;
const DEPTH_CAP = 70;
const MIN_SEPARATION = SIZE;
const LOOP_COUNT = 20;
const LOOP_MIN_CYCLE = 30;
const MIN_TARGET_GAP = 12;
const MAX_GOALS = 9;
const WALL_PX = 2.5;
const WALL_COLOR = 'rgb(0, 0, 0)';
const PLAYER_COLOR = '#ff0000';
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
const N = SIZE * SIZE;
const DR = [-1, 0, 1, 0];
const DC = [0, 1, 0, -1];
const NB = new Int16Array(N * 4).fill(-1);
for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
        for (let d = 0; d < 4; d++) {
            const nr = r + DR[d], nc = c + DC[d];
            if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE) NB[(r * SIZE + c) * 4 + d] = nr * SIZE + nc;
        }
    }
}
const rnd = n => (Math.random() * n) | 0;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const $ = id => document.getElementById(id);
const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
let open = new Uint8Array(N);
let startCell = 0;
let exits = [];
let player = 0;
let isGameOver = true;
const mazeCanvas = $('maze');
const messageElement = $('message');
function carveTree(pNewest, window_, straightW) {
    const o = new Uint8Array(N);
    const seen = new Uint8Array(N);
    const dirIn = new Int8Array(N).fill(-1);
    const list = [];
    const cand = [0, 0, 0, 0], wt = [0, 0, 0, 0];
    const first = rnd(N);
    seen[first] = 1;
    list.push(first);
    while (list.length) {
        const li = Math.random() < pNewest
            ? list.length - 1
            : list.length - 1 - rnd(Math.min(list.length, window_));
        const cur = list[li];
        let cnt = 0, tot = 0;
        for (let d = 0; d < 4; d++) {
            const n = NB[cur * 4 + d];
            if (n >= 0 && !seen[n]) {
                const w = d === dirIn[cur] ? straightW : 1;
                cand[cnt] = d; wt[cnt] = w; tot += w; cnt++;
            }
        }
        if (cnt === 0) {
            if (li === list.length - 1) list.pop(); else list.splice(li, 1);
            continue;
        }
        let x = Math.random() * tot, k = 0;
        while (k < cnt - 1 && x >= wt[k]) { x -= wt[k]; k++; }
        const d = cand[k];
        const nxt = NB[cur * 4 + d];
        o[cur] |= 1 << d;
        o[nxt] |= 1 << ((d + 2) & 3);
        seen[nxt] = 1;
        dirIn[nxt] = d;
        list.push(nxt);
    }
    return o;
}
const queue = new Int32Array(N);
function bfs(o, src, dist, prev) {
    dist.fill(-1);
    dist[src] = 0;
    if (prev) prev[src] = -1;
    let head = 0, tail = 0, last = src;
    queue[tail++] = src;
    while (head < tail) {
        const u = queue[head++];
        last = u;
        const m = o[u];
        for (let d = 0; d < 4; d++) {
            if (m & (1 << d)) {
                const v = NB[u * 4 + d];
                if (dist[v] < 0) {
                    dist[v] = dist[u] + 1;
                    if (prev) prev[v] = u;
                    queue[tail++] = v;
                }
            }
        }
    }
    return last;
}
const dA = new Int32Array(N), dG = new Int32Array(N), dP = new Int32Array(N);
const prevA = new Int32Array(N), rootOf = new Int32Array(N), maxDepth = new Int32Array(N);
const onPath = new Uint8Array(N);
function evaluate(o) {
    const a = bfs(o, rnd(N), dA, null);
    const b = bfs(o, a, dA, prevA);
    const L = dA[b];
    onPath.fill(0);
    const path = [];
    for (let v = b; v !== -1; v = prevA[v]) { onPath[v] = 1; path.push(v); }
    const swap = Math.random() < 0.5;
    const s = swap ? b : a, g = swap ? a : b;
    let turns = 0, lastD = -1;
    for (let i = 0; i + 1 < path.length; i++) {
        let d = 0;
        while (NB[path[i] * 4 + d] !== path[i + 1]) d++;
        if (lastD >= 0 && d !== lastD) turns++;
        lastD = d;
    }
    dP.fill(-1); rootOf.fill(-1); maxDepth.fill(0);
    let head = 0, tail = 0;
    for (const p of path) { dP[p] = 0; queue[tail++] = p; }
    while (head < tail) {
        const u = queue[head++], m = o[u];
        for (let d = 0; d < 4; d++) {
            if (m & (1 << d)) {
                const v = NB[u * 4 + d];
                if (dP[v] < 0) {
                    dP[v] = dP[u] + 1;
                    rootOf[v] = onPath[u] ? v : rootOf[u];
                    queue[tail++] = v;
                }
            }
        }
    }
    for (let v = 0; v < N; v++) {
        if (!onPath[v] && dP[v] > maxDepth[rootOf[v]]) maxDepth[rootOf[v]] = dP[v];
    }
    let branches = 0, deepSum = 0, deadEnds = 0;
    for (let v = 0; v < N; v++) {
        if (rootOf[v] === v && maxDepth[v] >= BRANCH_MIN) {
            branches++;
            deepSum += Math.min(maxDepth[v], DEPTH_CAP);
        }
        const m = o[v];
        if (m && (m & (m - 1)) === 0) deadEnds++;
    }
    bfs(o, g, dG, null);
    const gr = (g / SIZE) | 0, gc = g % SIZE;
    const lureRoots = new Set();
    for (let r = Math.max(0, gr - 4); r <= Math.min(SIZE - 1, gr + 4); r++) {
        for (let c = Math.max(0, gc - 4); c <= Math.min(SIZE - 1, gc + 4); c++) {
            const v = r * SIZE + c;
            if (!onPath[v] && dG[v] >= 40) lureRoots.add(rootOf[v]);
        }
    }
    const lures = Math.min(lureRoots.size, 8);
    const sep = Math.abs(((s / SIZE) | 0) - gr) + Math.abs((s % SIZE) - gc);
    let score = L + 1.2 * deepSum + 6 * branches + 0.5 * turns + 10 * lures;
    if (sep < MIN_SEPARATION) score *= 0.6;
    return { score, L, s, g, branches, deepSum, deadEnds, turns, lures, sep };
}
const dS = new Int32Array(N), dGoal = new Int32Array(N);
const stamp = new Int32Array(N), localDist = new Int32Array(N);
let stampId = 0;
function reachableWithin(o, u, v, maxD) {
    stampId++;
    let head = 0, tail = 0;
    queue[tail++] = u; stamp[u] = stampId; localDist[u] = 0;
    while (head < tail) {
        const x = queue[head++];
        if (x === v) return true;
        if (localDist[x] >= maxD) continue;
        const m = o[x];
        for (let d = 0; d < 4; d++) {
            if (m & (1 << d)) {
                const y = NB[x * 4 + d];
                if (stamp[y] !== stampId) { stamp[y] = stampId; localDist[y] = localDist[x] + 1; queue[tail++] = y; }
            }
        }
    }
    return false;
}
function addDetourLoops(o, s, g, L, count) {
    bfs(o, s, dS, null);
    bfs(o, g, dGoal, null);
    const walls = [];
    for (let u = 0; u < N; u++) {
        for (let d = 1; d <= 2; d++) {
            if (NB[u * 4 + d] >= 0 && !(o[u] & (1 << d))) walls.push(u * 4 + d);
        }
    }
    for (let i = walls.length - 1; i > 0; i--) {
        const j = rnd(i + 1);
        const t = walls[i]; walls[i] = walls[j]; walls[j] = t;
    }
    let added = 0;
    for (let i = 0; i < walls.length && added < count; i++) {
        const u = walls[i] >> 2, d = walls[i] & 3, v = NB[u * 4 + d];
        if (Math.min(dS[u] + 1 + dGoal[v], dS[v] + 1 + dGoal[u]) <= L) continue;
        if (reachableWithin(o, u, v, LOOP_MIN_CYCLE - 2)) continue;
        o[u] |= 1 << d;
        o[v] |= 1 << ((d + 2) & 3);
        added++;
        bfs(o, s, dS, null);
        bfs(o, g, dGoal, null);
    }
    return added;
}
function generateBest() {
    let best = null;
    for (let i = 0; i < CANDIDATES; i++) {
        const pNewest = 0.55 + Math.random() * 0.4;
        const win = 4 + rnd(40);
        const straightW = 0.35 + Math.random() * 0.8;
        const o = carveTree(pNewest, win, straightW);
        const ev = evaluate(o);
        if (!best || ev.score > best.score) best = { ...ev, o };
    }
    best.loops = addDetourLoops(best.o, best.s, best.g, best.L, LOOP_COUNT);
    return best;
}
function pickTargets(g, count) {
    const chosen = [startCell, g];
    const minD = new Int32Array(N).fill(1 << 30);
    const d = new Int32Array(N);
    const addSource = c => {
        bfs(open, c, d, null);
        for (let v = 0; v < N; v++) if (d[v] < minD[v]) minD[v] = d[v];
    };
    addSource(startCell);
    addSource(g);
    let gap = MIN_TARGET_GAP;
    while (chosen.length < count + 1) {
        let best = -1, bd = 0;
        for (let v = 0; v < N; v++) {
            if (minD[v] <= bd) continue;
            const r = (v / SIZE) | 0, c = v % SIZE;
            let ok = true;
            for (const q of chosen) {
                if (Math.abs(r - ((q / SIZE) | 0)) + Math.abs(c - (q % SIZE)) < gap) { ok = false; break; }
            }
            if (ok) { best = v; bd = minD[v]; }
        }
        if (best < 0) { gap--; continue; }
        chosen.push(best);
        addSource(best);
    }
    return chosen.slice(1);
}
function generateMazeData(count) {
    const m = generateBest();
    open = m.o;
    startCell = m.s;
    exits = pickTargets(m.g, count);
    return m;
}
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
const SAVE_KEY = 'mazeSave';
let moves = '', mazeCode = '';
function fitLayout() {
    dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth, h = window.innerHeight;
    const wide = w >= 640 && w / h > 1.1;
    const side = wide
        ? Math.min(w - PANEL_W - 14 - 28, h - 84)
        : Math.min(w - 20, h - 232);
    V = clamp(Math.floor(side / 2) * 2, 240, 960);
    document.body.classList.toggle('wide', wide);
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
    ctx.strokeStyle = PLAYER_COLOR;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1.6 / s;
    ctx.stroke();
    ctx.globalAlpha = 1;
    for (let i = 0; i < exits.length; i++) {
        const ex = (exits[i] % SIZE) + 0.5, ey = ((exits[i] / SIZE) | 0) + 0.5;
        if (collected[i]) {
            ctx.beginPath();
            ctx.arc(ex, ey, EXIT_R * 0.55, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.fill();
            continue;
        }
        if (!reduceMotion) {
            for (let k = 0; k < 2; k++) {
                const ph = (time * 0.8 + k * 0.5 + i * 0.13) % 1;
                ctx.beginPath();
                ctx.arc(ex, ey, EXIT_R * 0.7 + ph * 0.95, 0, Math.PI * 2);
                ctx.strokeStyle = EXIT_COLOR;
                ctx.globalAlpha = (1 - ph) * 0.55 * ease;
                ctx.lineWidth = 2 / s;
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
        }
        ctx.save();
        ctx.translate(ex, ey);
        if (!reduceMotion) ctx.rotate(time * 0.9);
        ctx.scale(ease, ease);
        ctx.shadowColor = EXIT_COLOR; ctx.shadowBlur = 10 * dpr;
        ctx.fillStyle = EXIT_COLOR;
        ctx.beginPath();
        ctx.moveTo(0, -EXIT_R); ctx.lineTo(EXIT_R, 0); ctx.lineTo(0, EXIT_R); ctx.lineTo(-EXIT_R, 0);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.6 / s;
        ctx.lineJoin = 'round';
        ctx.stroke();
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
            const txt = String(left), col = left <= 10 ? '#ffd24a' : '#fff';
            let lx, ly;
            if (sx >= 0 && sx <= V && sy >= 0 && sy <= V) {
                const r = EXIT_R * s + 6;
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
    const pr = PLAYER_R * (1 + (reduceMotion ? 0 : 0.06 * Math.sin(time * 6)) + 0.28 * pop);
    ctx.save();
    ctx.shadowColor = PLAYER_COLOR; ctx.shadowBlur = 12 * dpr;
    ctx.fillStyle = PLAYER_COLOR;
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
    if (i < 0 || collected[i]) return;
    collected[i] = 1;
    goals++;
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
    const colors = [PLAYER_COLOR, EXIT_COLOR, '#ffd24a', '#ffffff', '#7cfc9a'];
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
        if (!collected[i] && (bi < 0 || exitDists[i][player] < exitDists[bi][player])) bi = i;
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
function optimalTour() {
    const K = exits.length, full = (1 << K) - 1;
    const dp = new Array((full + 1) * K).fill(Infinity);
    for (let i = 0; i < K; i++) dp[(1 << i) * K + i] = exitDists[i][startCell];
    for (let m = 1; m <= full; m++) {
        for (let i = 0; i < K; i++) {
            const cur = dp[m * K + i];
            if (cur === Infinity) continue;
            for (let j = 0; j < K; j++) {
                if (m & (1 << j)) continue;
                const nm = m | (1 << j), v = cur + exitDists[j][exits[i]];
                if (v < dp[nm * K + j]) dp[nm * K + j] = v;
            }
        }
    }
    let best = Infinity;
    for (let i = 0; i < K; i++) best = Math.min(best, dp[full * K + i]);
    return best;
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
    if (isGameOver) return;
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
    confirmTitle.textContent = resume ? 'Unfinished game found' : 'End current game?';
    confirmText.textContent = resume
        ? 'You left a game in progress. Continue it, or end it and see the shortest paths?'
        : 'The game will stop and the shortest paths from the start to every point will be shown.';
}
function showMenu() {
    winCard.classList.remove('show');
    banner.classList.remove('show');
    confirmEl.classList.remove('show');
    menuEl.classList.add('show');
    document.body.classList.add('in-menu');
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
    isGameOver = true;
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
    menuEl.classList.remove('show');
    confirmEl.classList.remove('show');
    banner.classList.remove('show');
    document.body.classList.remove('in-menu');
    fitLayout();
}
function beginScene() {
    mazeCode = Array.from(open, v => v.toString(16)).join('');
    for (let i = 0; i < exits.length; i++) bfs(open, exits[i], exitDists[i], null);
    solutionLen = optimalTour();
    collected.fill(0);
    goals = 0;
    player = startCell;
    steps = 0; moves = '';
    startTime = endTime = null;
    hintsLeft = HINTS_PER_MAZE; hintsUsed = 0; hint = null;
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
    resetUi();
    generateMazeData(goalTotal);
    beginScene();
    saveGame();
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
        if (i >= 0 && !collected[i]) { collected[i] = 1; goals++; }
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
const stageEl = $('stage');
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
    return {
        w: Math.max(1, stage.clientWidth - padWrap.offsetWidth - 2 * PAD_M),
        h: Math.max(1, stage.clientHeight - padWrap.offsetHeight - 2 * PAD_M)
    };
}
function placePad() {
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
for (const b of document.querySelectorAll('.opt')) b.addEventListener('click', () => initGame(+b.dataset.n));
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
    const saved = loadSave();
    if (saved) restoreGame(saved); else showMenu();
    requestAnimationFrame(frame);
};
