/**
 * Maze generation and graph algorithms.
 * Pure core module: no DOM, HUD, or game-session side effects.
 *
 * Everything that depends on the board size lives in a "grid" (see getGrid), so
 * several board sizes can coexist at once: the running game uses one grid while the
 * Create-Game previews use the others.
 */

/** One entry of the difficulty menu: the board side length for a named level. */
export interface Difficulty {
    id: string;
    label: string;
    size: number;
}

/** Size-dependent generation heuristics (see buildGrid). */
export interface GridTuning {
    branchMin: number;
    depthCap: number;
    minSeparation: number;
    loopCount: number;
    loopMinCycle: number;
    lureDistance: number;
    targetGap: number;
}

/** Scratch buffers shared by the algorithms (single-threaded, never re-entrant). */
export interface GridBuffers {
    queue: Int32Array;
    dA: Int32Array;
    dG: Int32Array;
    dP: Int32Array;
    prevA: Int32Array;
    rootOf: Int32Array;
    maxDepth: Int32Array;
    onPath: Uint8Array;
    dS: Int32Array;
    dGoal: Int32Array;
    stamp: Int32Array;
    localDist: Int32Array;
    stampId: number;
}

/**
 * Everything that depends on the board size. `NB[cell * 4 + direction]` is the neighbouring cell
 * (or -1 at the border); directions follow DR / DC (0 = up, 1 = right, 2 = down, 3 = left).
 */
export interface Grid {
    SIZE: number;
    N: number;
    NB: Int16Array;
    tune: GridTuning;
    buf: GridBuffers;
}

/** A generated maze. `open[cell]` is the wall bit mask: bit `d` set means the passage in direction `d` is open. */
export interface MazeData {
    open: Uint8Array;
    startCell: number;
    exits: number[];
    size: number;
}

export const DIFFICULTIES: readonly Readonly<Difficulty>[] = Object.freeze([
    Object.freeze({ id: 'easy', label: 'Easy', size: 21 }),
    Object.freeze({ id: 'medium', label: 'Medium', size: 33 }),
    Object.freeze({ id: 'hard', label: 'Hard', size: 45 })
]);
export const MAZE_SIZES: readonly number[] = Object.freeze(DIFFICULTIES.map(d => d.size));
export const DEFAULT_SIZE = 33;
export const MIN_GOALS = 1;
export const MAX_GOALS = 99;
export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 99;
export const DR: number[] = [-1, 0, 1, 0];
export const DC: number[] = [0, 1, 0, -1];
export const rnd = (n: number): number => (Math.random() * n) | 0;
export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

// The generation heuristics were tuned on a 42×42 board; they scale with the board side.
const REFERENCE_SIZE = 42;
const CANDIDATES = 36;
// With many targets, "farthest-first" ordering would send the player zig-zagging across the
// whole maze for every single target. Above this count the targets are chained as a tour.
const TOUR_MIN_COUNT = 9;
// Legacy saves (42×42) are still playable, so the accepted range is wider than the menu sizes.
const MIN_SIZE = 8, MAX_SIZE = 64;

const grids = new Map<number, Grid>();
// `size` is typed loosely on purpose: the original accepts anything Number() can convert and throws a RangeError otherwise.
export function getGrid(size: number | string): Grid {
    const side = Math.round(Number(size));
    if (!Number.isInteger(side) || side < MIN_SIZE || side > MAX_SIZE) {
        throw new RangeError(`Unsupported maze size: ${size}`);
    }
    let grid = grids.get(side);
    if (!grid) { grid = buildGrid(side); grids.set(side, grid); }
    return grid;
}

function buildGrid(SIZE: number): Grid {
    const N = SIZE * SIZE;
    const NB = new Int16Array(N * 4).fill(-1);
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            for (let d = 0; d < 4; d++) {
                const nr = r + DR[d], nc = c + DC[d];
                if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE) NB[(r * SIZE + c) * 4 + d] = nr * SIZE + nc;
            }
        }
    }
    const f = SIZE / REFERENCE_SIZE;
    return {
        SIZE,
        N,
        NB,
        tune: {
            branchMin: Math.max(3, Math.round(5 * f)),
            depthCap: Math.round(70 * f),
            minSeparation: SIZE,
            loopCount: Math.max(4, Math.round(20 * f * f)),
            loopMinCycle: Math.max(12, Math.round(30 * f)),
            lureDistance: Math.round(40 * f),
            targetGap: Math.max(4, Math.round(12 * f))
        },
        // Scratch buffers shared by the algorithms below (single-threaded, never re-entrant).
        buf: {
            queue: new Int32Array(N),
            dA: new Int32Array(N), dG: new Int32Array(N), dP: new Int32Array(N),
            prevA: new Int32Array(N), rootOf: new Int32Array(N), maxDepth: new Int32Array(N),
            onPath: new Uint8Array(N),
            dS: new Int32Array(N), dGoal: new Int32Array(N),
            stamp: new Int32Array(N), localDist: new Int32Array(N), stampId: 0
        }
    };
}

function carveTree(grid: Grid, pNewest: number, window_: number, straightW: number): Uint8Array {
    const { N, NB } = grid;
    const o = new Uint8Array(N);
    const seen = new Uint8Array(N);
    const dirIn = new Int8Array(N).fill(-1);
    const list: number[] = [];
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

/** Breadth-first distances (and optionally predecessors) from `src`; returns the last cell reached. */
export function bfs(grid: Grid, o: Uint8Array, src: number, dist: Int32Array, prev?: Int32Array | null): number {
    const { NB } = grid, queue = grid.buf.queue;
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

interface Evaluation {
    score: number;
    L: number;
    s: number;
    g: number;
    branches: number;
    deepSum: number;
    deadEnds: number;
    turns: number;
    lures: number;
    sep: number;
}

function evaluate(grid: Grid, o: Uint8Array): Evaluation {
    const { SIZE, N, NB, tune } = grid;
    const { queue, dA, dG, dP, prevA, rootOf, maxDepth, onPath } = grid.buf;
    const a = bfs(grid, o, rnd(N), dA, null);
    const b = bfs(grid, o, a, dA, prevA);
    const L = dA[b];
    onPath.fill(0);
    const path: number[] = [];
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
        if (rootOf[v] === v && maxDepth[v] >= tune.branchMin) {
            branches++;
            deepSum += Math.min(maxDepth[v], tune.depthCap);
        }
        const m = o[v];
        if (m && (m & (m - 1)) === 0) deadEnds++;
    }
    bfs(grid, o, g, dG, null);
    const gr = (g / SIZE) | 0, gc = g % SIZE;
    const lureRoots = new Set<number>();
    for (let r = Math.max(0, gr - 4); r <= Math.min(SIZE - 1, gr + 4); r++) {
        for (let c = Math.max(0, gc - 4); c <= Math.min(SIZE - 1, gc + 4); c++) {
            const v = r * SIZE + c;
            if (!onPath[v] && dG[v] >= tune.lureDistance) lureRoots.add(rootOf[v]);
        }
    }
    const lures = Math.min(lureRoots.size, 8);
    const sep = Math.abs(((s / SIZE) | 0) - gr) + Math.abs((s % SIZE) - gc);
    let score = L + 1.2 * deepSum + 6 * branches + 0.5 * turns + 10 * lures;
    if (sep < tune.minSeparation) score *= 0.6;
    return { score, L, s, g, branches, deepSum, deadEnds, turns, lures, sep };
}

function reachableWithin(grid: Grid, o: Uint8Array, u: number, v: number, maxD: number): boolean {
    const { NB } = grid, { queue, stamp, localDist } = grid.buf;
    const id = ++grid.buf.stampId;
    let head = 0, tail = 0;
    queue[tail++] = u; stamp[u] = id; localDist[u] = 0;
    while (head < tail) {
        const x = queue[head++];
        if (x === v) return true;
        if (localDist[x] >= maxD) continue;
        const m = o[x];
        for (let d = 0; d < 4; d++) {
            if (m & (1 << d)) {
                const y = NB[x * 4 + d];
                if (stamp[y] !== id) { stamp[y] = id; localDist[y] = localDist[x] + 1; queue[tail++] = y; }
            }
        }
    }
    return false;
}

function addDetourLoops(grid: Grid, o: Uint8Array, s: number, g: number, L: number, count: number): number {
    const { N, NB, tune } = grid, { dS, dGoal } = grid.buf;
    bfs(grid, o, s, dS, null);
    bfs(grid, o, g, dGoal, null);
    const walls: number[] = [];
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
        if (reachableWithin(grid, o, u, v, tune.loopMinCycle - 2)) continue;
        o[u] |= 1 << d;
        o[v] |= 1 << ((d + 2) & 3);
        added++;
        bfs(grid, o, s, dS, null);
        bfs(grid, o, g, dGoal, null);
    }
    return added;
}

interface Candidate extends Evaluation {
    o: Uint8Array;
    loops?: number;
}

function generateBest(grid: Grid, candidates = CANDIDATES): Candidate & { loops: number } {
    let best: Candidate | null = null;
    for (let i = 0; i < candidates; i++) {
        const pNewest = 0.55 + Math.random() * 0.4;
        const win = 4 + rnd(Math.max(8, Math.round(40 * grid.SIZE / REFERENCE_SIZE)));
        const straightW = 0.35 + Math.random() * 0.8;
        const o = carveTree(grid, pNewest, win, straightW);
        const ev = evaluate(grid, o);
        if (!best || ev.score > best.score) best = { ...ev, o };
    }
    // Non-null: the original dereferences `best` here too (the candidate count is never 0).
    best!.loops = addDetourLoops(grid, best!.o, best!.s, best!.g, best!.L, grid.tune.loopCount);
    return best as Candidate & { loops: number };
}

/**
 * Spread targets across the maze: greedy farthest-point sampling in maze distance with a
 * minimum Manhattan gap that relaxes only when the board is too crowded for it.
 * The returned order is the sampling order (the first target is the goal `g`).
 */
function pickTargets(grid: Grid, g: number, count: number, mazeOpen: Uint8Array, mazeStart: number): number[] {
    const { SIZE, N } = grid;
    const chosen = [mazeStart, g];
    const minD = new Int32Array(N).fill(1 << 30);
    const d = new Int32Array(N);
    const addSource = (c: number): void => {
        bfs(grid, mazeOpen, c, d, null);
        for (let v = 0; v < N; v++) if (d[v] < minD[v]) minD[v] = d[v];
    };
    addSource(mazeStart);
    addSource(g);
    let gap = grid.tune.targetGap;
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
        if (best < 0) {
            if (gap <= 0) break; // every free cell is already taken
            gap--;
            continue;
        }
        chosen.push(best);
        addSource(best);
    }
    return chosen.slice(1);
}

/** Re-orders targets into a nearest-neighbour tour from the start (keeps long courses playable). */
function orderAsTour(grid: Grid, mazeOpen: Uint8Array, mazeStart: number, targets: number[]): number[] {
    const { N } = grid;
    const dist = targets.map(cell => {
        const row = new Int32Array(N);
        bfs(grid, mazeOpen, cell, row, null);
        return row;
    });
    const left = targets.map((_, i) => i);
    const order: number[] = [];
    let at = mazeStart;
    while (left.length) {
        let bestPos = 0;
        for (let k = 1; k < left.length; k++) {
            if (dist[left[k]][at] < dist[left[bestPos]][at]) bestPos = k;
        }
        const idx = left.splice(bestPos, 1)[0];
        order.push(targets[idx]);
        at = targets[idx];
    }
    return order;
}

export function generateMazeData(count?: number | null, size: number | string = DEFAULT_SIZE): MazeData {
    const grid = getGrid(size);
    const safeCount = clamp(Math.round(count || 3), MIN_GOALS, MAX_GOALS);
    const m = generateBest(grid);
    let exits = pickTargets(grid, m.g, safeCount, m.o, m.s);
    if (safeCount > TOUR_MIN_COUNT) exits = orderAsTour(grid, m.o, m.s, exits);
    return { open: m.o, startCell: m.s, exits, size: grid.SIZE };
}

/**
 * Cheap representative maze for the Create-Game previews. `exits` holds the maximum number of
 * targets in sampling order, so showing "k targets" is simply the first k entries.
 */
export function generatePreviewMaze(size: number | string): MazeData {
    const grid = getGrid(size);
    const m = generateBest(grid, 5);
    return {
        size: grid.SIZE,
        open: m.o,
        startCell: m.s,
        exits: pickTargets(grid, m.g, MAX_GOALS, m.o, m.s)
    };
}
