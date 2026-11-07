/**
 * The living maze behind "Create Your Game".
 * One canvas shows a representative maze for the board size being chosen and reacts to every
 * decision: it morphs between 21 / 33 / 45 while the lens is dragged, floods the corridors
 * with racers from the start cell, and drops numbered targets onto the board.
 * It is a preview only; the real maze is generated when the game starts.
 */
import { generatePreviewMaze, getGrid, MAZE_SIZES, MAX_GOALS } from '@maze/shared';
import { animate, clamp, lerp, easeOutBack, easeOutCubic, prefersReducedMotion } from './motion';

const WALL = '#cfeee0';
const BLOOM = '#8be0a4';
const TARGET_FILL = '#8fb0ff';
const YOU = '#ff9b8a';
const racerColor = i => `hsl(${Math.round((i * 137.508 + 30) % 360)}, 70%, 66%)`;
const RACER_COLORS = Array.from({ length: MAX_GOALS }, (_, i) => racerColor(i));

function buildWallPath(open, size) {
    const p = new Path2D();
    for (let r = 0; r <= size; r++) {
        let run = -1;
        for (let c = 0; c <= size; c++) {
            const wall = c < size && (r === 0 || r === size || !(open[(r - 1) * size + c] & 4));
            if (wall && run < 0) run = c;
            if (!wall && run >= 0) { p.moveTo(run, r); p.lineTo(c, r); run = -1; }
        }
    }
    for (let c = 0; c <= size; c++) {
        let run = -1;
        for (let r = 0; r <= size; r++) {
            const wall = r < size && (c === 0 || c === size || !(open[r * size + c - 1] & 2));
            if (wall && run < 0) run = r;
            if (!wall && run >= 0) { p.moveTo(c, run); p.lineTo(c, r); run = -1; }
        }
    }
    return p;
}

/** Cells in order of walking distance from the start: where racers line up as the crowd grows. */
function floodOrder(open, size, start, limit) {
    const grid = getGrid(size);
    const seen = new Uint8Array(grid.N);
    const order = [start];
    seen[start] = 1;
    for (let head = 0; head < order.length && order.length < limit; head++) {
        const u = order[head];
        for (let d = 0; d < 4 && order.length < limit; d++) {
            if (open[u] & (1 << d)) {
                const v = grid.NB[u * 4 + d];
                if (!seen[v]) { seen[v] = 1; order.push(v); }
            }
        }
    }
    return order;
}

export class MazeStage {
    declare canvas: any;
    declare ctx: any;
    declare previews: any;
    declare layers: any;
    declare dpr: number;
    declare w: number;
    declare h: number;
    declare level: number;
    declare racers: number;
    declare targets: number;
    declare showRacers: boolean;
    declare showTargets: boolean;
    declare racerScale: Float32Array<ArrayBuffer>;
    declare targetScale: Float32Array<ArrayBuffer>;
    declare racerAlpha: number;
    declare targetAlpha: number;
    declare reveal: number;
    declare launch: number;
    declare launching: boolean;
    declare active: boolean;
    declare stopLoop: any;
    declare onLaunched: any;
    declare observer: ResizeObserver;

    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.previews = new Map();
        this.layers = new Map();
        this.dpr = 1;
        this.w = 0; this.h = 0;
        this.level = 1;          // continuous 0..2 across the three board sizes
        this.racers = 1;
        this.targets = 3;
        this.showRacers = true;
        this.showTargets = false;
        this.racerScale = new Float32Array(MAX_GOALS);
        this.targetScale = new Float32Array(MAX_GOALS);
        this.racerAlpha = 1;
        this.targetAlpha = 0;
        this.reveal = 1;
        this.launch = 0;
        this.launching = false;
        this.active = false;
        this.stopLoop = null;
        this.onLaunched = null;

        this.observer = new ResizeObserver(() => this.resize());
        this.observer.observe(canvas);
        this.resize();
    }

    /* ── Data ── */
    preview(size) {
        let p = this.previews.get(size);
        if (!p) {
            const maze = generatePreviewMaze(size);
            p = {
                ...maze,
                wallPath: buildWallPath(maze.open, size),
                flood: floodOrder(maze.open, size, maze.startCell, MAX_GOALS)
            };
            this.previews.set(size, p);
        }
        return p;
    }
    /** Builds the remaining board sizes in the background so dragging the lens never stalls. */
    warm() {
        const todo = MAZE_SIZES.filter(size => !this.previews.has(size));
        const next = () => {
            const size = todo.shift();
            if (size === undefined) return;
            this.preview(size);
            this.requestDraw();
            (window.requestIdleCallback || (cb => setTimeout(cb, 60)))(next);
        };
        (window.requestIdleCallback || (cb => setTimeout(cb, 60)))(next);
    }
    shuffle() {
        this.previews.clear();
        this.layers.clear();
        this.preview(MAZE_SIZES[Math.round(clamp(this.level, 0, 2))]);
        this.warm();
        this.requestDraw();
    }

    /* ── State ── */
    setLevel(t) { this.level = clamp(t, 0, 2); this.requestDraw(); }
    setRacers(n) { this.racers = clamp(Math.round(n), 1, MAX_GOALS); this.requestDraw(); }
    setTargets(n) { this.targets = clamp(Math.round(n), 1, MAX_GOALS); this.requestDraw(); }
    setLayers({ racers, targets }) {
        this.showRacers = !!racers;
        this.showTargets = !!targets;
        this.requestDraw();
    }
    /** Replays the draw-in sweep. */
    playReveal() {
        this.reveal = prefersReducedMotion() ? 1 : 0;
        this.requestDraw();
    }
    /** Brief swell before the real game takes over; calls `done` when finished. */
    playLaunch(done) {
        if (prefersReducedMotion()) { done && done(); return; }
        this.launching = true;
        this.launch = 0;
        this.onLaunched = done;
        this.requestDraw();
    }
    resetLaunch() { this.launching = false; this.launch = 0; this.requestDraw(); }
    setActive(on) {
        this.active = on;
        if (on) { this.resize(); this.requestDraw(); }
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const w = Math.max(1, Math.round(rect.width)), h = Math.max(1, Math.round(rect.height));
        if (w === this.w && h === this.h && dpr === this.dpr) return;
        this.w = w; this.h = h; this.dpr = dpr;
        this.canvas.width = Math.round(w * dpr);
        this.canvas.height = Math.round(h * dpr);
        this.layers.clear();
        this.requestDraw();
    }

    /* ── Frame loop ── */
    requestDraw() {
        if (this.stopLoop || !this.active) return;
        this.stopLoop = animate((dt, now) => {
            const busy = this.update(dt);
            this.draw(now / 1000);
            const pulse = this.showTargets && !prefersReducedMotion();
            if (!(busy || pulse)) this.stopLoop = null;
            return busy || pulse;
        });
    }
    update(dt) {
        let busy = false;
        if (this.reveal < 1) { this.reveal = Math.min(1, this.reveal + dt / 1.1); busy = true; }
        if (this.launching) {
            this.launch = Math.min(1, this.launch + dt / 0.55);
            busy = true;
            if (this.launch >= 1) {
                this.launching = false;
                const cb = this.onLaunched;
                this.onLaunched = null;
                if (cb) cb();
            }
        }
        const k = prefersReducedMotion() ? 1 : 1 - Math.exp(-dt * 13);
        const chase = (arr, want, visible) => {
            for (let i = 0; i < arr.length; i++) {
                const goal = visible && i < want ? 1 : 0;
                const diff = goal - arr[i];
                if (Math.abs(diff) > 0.002) { arr[i] += diff * k; busy = true; } else arr[i] = goal;
            }
        };
        chase(this.racerScale, this.racers, this.showRacers);
        // The start cell always keeps its "you" marker.
        if (!this.showRacers) this.racerScale[0] = Math.max(this.racerScale[0], 1);
        chase(this.targetScale, this.targets, this.showTargets);
        return busy;
    }

    /* ── Rendering ── */
    /** Pre-rendered glowing walls for one board size at the current pixel size (cached). */
    levelImage(size, side) {
        const key = `${size}:${side}:${this.dpr}`;
        let layer = this.layers.get(key);
        if (layer) return layer;
        const p = this.preview(size);
        const px = Math.max(2, Math.round(side * this.dpr));
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = px;
        const g = canvas.getContext('2d');
        const cell = px / size;
        g.scale(cell, cell);
        g.lineCap = 'round';
        g.lineJoin = 'round';
        const cssCell = side / size;
        g.strokeStyle = BLOOM;
        g.globalAlpha = 0.16;
        g.lineWidth = Math.max(0.32, 4.4 / cssCell);
        g.stroke(p.wallPath);
        g.globalAlpha = 0.9;
        g.strokeStyle = WALL;
        g.lineWidth = clamp(cssCell * 0.085, 1.05, 2.2) / cssCell;
        g.stroke(p.wallPath);
        layer = { canvas };
        this.layers.set(key, layer);
        return layer;
    }

    draw(time) {
        const { ctx, w, h, dpr } = this;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        const side = Math.floor(Math.min(w, h) * 0.9);
        if (side < 40) return;
        const t = clamp(this.level, 0, 2);
        const i = Math.min(1, Math.floor(t));
        const f = t - i;
        const swell = this.launching || this.launch > 0 ? 1 + 0.12 * easeOutCubic(this.launch) : 1;
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.scale(swell, swell);
        ctx.translate(-w / 2, -h / 2);
        if (this.reveal < 1) {
            const r = easeOutCubic(this.reveal) * side * 0.78;
            ctx.beginPath();
            ctx.arc(w / 2, h / 2, Math.max(1, r), 0, Math.PI * 2);
            ctx.clip();
        }
        if (f < 0.002) {
            this.drawLevel(MAZE_SIZES[i], side, 1, 1, time);
        } else {
            const ease = f * f * (3 - 2 * f);
            this.drawLevel(MAZE_SIZES[i], side, 1 - ease, lerp(1, 0.84, ease), time);
            this.drawLevel(MAZE_SIZES[i + 1], side, ease, lerp(1.18, 1, ease), time);
        }
        ctx.restore();
        if (this.reveal < 1) this.drawScan(side);
        if (this.launch > 0) this.drawLaunchRing(side);
    }

    drawScan(side) {
        const { ctx, w, h } = this;
        const e = easeOutCubic(this.reveal);
        ctx.save();
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, Math.max(1, e * side * 0.78), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 215, 154, ${0.5 * (1 - e)})`;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
    }

    drawLaunchRing(side) {
        const { ctx, w, h } = this;
        const e = easeOutCubic(this.launch);
        ctx.save();
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, e * side * 0.85, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(207, 238, 224, ${0.55 * (1 - e)})`;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
    }

    drawLevel(size, side, alpha, scale, time) {
        if (alpha <= 0.003) return;
        const { ctx, w, h } = this;
        const p = this.preview(size);
        const x0 = (w - side) / 2, y0 = (h - side) / 2;
        const cell = side / size;
        const cx = c => x0 + ((c % size) + 0.5) * cell;
        const cy = c => y0 + (((c / size) | 0) + 0.5) * cell;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(w / 2, h / 2);
        ctx.scale(scale, scale);
        ctx.translate(-w / 2, -h / 2);
        ctx.drawImage(this.levelImage(size, side).canvas, x0, y0, side, side);

        // Start cell
        const sx = cx(p.startCell), sy = cy(p.startCell);
        ctx.beginPath();
        ctx.arc(sx, sy, cell * 0.62, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 155, 138, 0.55)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Racers, flooding the corridors outwards from the start
        for (let i = this.racerScale.length - 1; i >= 0; i--) {
            const s = this.racerScale[i];
            if (s < 0.01) continue;
            const cellId = p.flood[Math.min(i, p.flood.length - 1)];
            const x = cx(cellId), y = cy(cellId);
            const r = cell * (i === 0 ? 0.3 : 0.22) * easeOutBack(clamp(s, 0, 1)) * (i === 0 ? 1 : 1);
            const color = i === 0 ? YOU : RACER_COLORS[i];
            ctx.globalAlpha = alpha * 0.2 * s;
            ctx.fillStyle = color;
            ctx.beginPath(); ctx.arc(x, y, r * 2.3, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = alpha * Math.min(1, s * 1.3);
            ctx.beginPath(); ctx.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2); ctx.fill();
            if (i === 0) {
                ctx.strokeStyle = 'rgba(255,255,255,0.9)';
                ctx.lineWidth = 1.4;
                ctx.stroke();
            }
        }
        ctx.globalAlpha = alpha;

        // Targets
        const digits = cell * 0.46;
        for (let i = this.targetScale.length - 1; i >= 0; i--) {
            const s = this.targetScale[i];
            if (s < 0.01) continue;
            const cellId = p.exits[i];
            if (cellId === undefined) continue;
            const x = cx(cellId), y = cy(cellId);
            const r = cell * 0.42 * easeOutBack(clamp(s, 0, 1));
            ctx.globalAlpha = alpha * Math.min(1, s * 1.3);
            if (i === 0 && !prefersReducedMotion()) {
                const ph = (time * 0.9) % 1;
                ctx.beginPath();
                ctx.arc(x, y, r * (1.2 + ph * 1.5), 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(143, 176, 255, ${0.6 * (1 - ph) * s})`;
                ctx.lineWidth = 1.6;
                ctx.stroke();
            }
            ctx.beginPath();
            ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
            ctx.closePath();
            ctx.fillStyle = TARGET_FILL;
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.92)';
            ctx.lineWidth = Math.max(0.8, cell * 0.05);
            ctx.lineJoin = 'round';
            ctx.stroke();
            const label = String(i + 1);
            const fits = label.length === 1 ? digits >= 6.5 : digits >= 8.5;
            if (fits) {
                ctx.fillStyle = '#0b1d3a';
                ctx.font = `700 ${Math.round(label.length === 1 ? digits : digits * 0.82)}px Montserrat, sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(label, x, y + cell * 0.02);
            }
        }
        ctx.restore();
    }
}
