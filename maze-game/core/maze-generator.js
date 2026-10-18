/**
 * Maze generation and graph algorithms.
 * Pure core module: no DOM, HUD, or game-session side effects.
 */
export const SIZE = 42;
const CANDIDATES = 36;
const BRANCH_MIN = 5;
const DEPTH_CAP = 70;
const MIN_SEPARATION = SIZE;
const LOOP_COUNT = 20;
const LOOP_MIN_CYCLE = 30;
const MIN_TARGET_GAP = 12;
export const MAX_GOALS = 9;
export const N = SIZE * SIZE;
export const DR = [-1, 0, 1, 0];
export const DC = [0, 1, 0, -1];
export const NB = new Int16Array(N * 4).fill(-1);
for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
        for (let d = 0; d < 4; d++) {
            const nr = r + DR[d], nc = c + DC[d];
            if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE) NB[(r * SIZE + c) * 4 + d] = nr * SIZE + nc;
        }
    }
}
export const rnd = n => (Math.random() * n) | 0;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

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
export function bfs(o, src, dist, prev) {
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
function pickTargets(g, count, mazeOpen, mazeStart) {
    const chosen = [mazeStart, g];
    const minD = new Int32Array(N).fill(1 << 30);
    const d = new Int32Array(N);
    const addSource = c => {
        bfs(mazeOpen, c, d, null);
        for (let v = 0; v < N; v++) if (d[v] < minD[v]) minD[v] = d[v];
    };
    addSource(mazeStart);
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
export function generateMazeData(count) {
    const safeCount = clamp(Math.round(count || 3), 3, MAX_GOALS);
    const m = generateBest();
    const mazeOpen = m.o;
    const mazeStart = m.s;
    const mazeExits = pickTargets(m.g, safeCount, mazeOpen, mazeStart);
    return { open: mazeOpen, startCell: mazeStart, exits: mazeExits };
}
