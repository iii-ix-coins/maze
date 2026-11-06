/**
 * Live thumbnail of a running race: the maze drawn small, its targets, and one soft dot per racer that glides
 * between the positions the server reports a few times per second. The leader wears a ring.
 */
import { wallSegments } from './lobby-model';
import { animate, prefersReducedMotion } from '../create-game/motion';

const WALL = 'rgba(139, 224, 164, .58)';
const TARGET = '#8fb0ff';

export class LiveThumb {
    declare canvas: any;
    declare ctx: any;
    declare size: number;
    declare dpr: number;
    declare maze: any;
    declare layer: any;
    declare dots: any;
    declare leader: number;
    declare leaderGoals: number;
    declare cancel: any;
    declare scale: any;
    declare pad: any;

    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.size = 0;
        this.dpr = 1;
        this.maze = null;       // { size, exits, colors, goals }
        this.layer = null;      // pre-rendered walls
        this.dots = [];         // { x, y, tx, ty, color, gone }
        this.leader = -1;
        this.leaderGoals = 0;
        this.cancel = null;
        this.resize();
    }

    resize() {
        const cssSize = this.canvas.clientWidth || Number(this.canvas.getAttribute('width')) || 132;
        const dpr = Math.min(2.5, window.devicePixelRatio || 1);
        const px = Math.max(1, Math.round(cssSize * dpr));
        if (this.canvas.width === px && this.size === cssSize) return;
        this.canvas.width = px;
        this.canvas.height = px;
        this.size = cssSize;
        this.dpr = px / cssSize;
        if (this.maze) this.buildLayer();
        this.wake();
    }

    /** The static part, from a `peek:maze` message. */
    setMaze(message) {
        const size = Number(message.size);
        this.maze = {
            size,
            exits: Array.isArray(message.exits) ? message.exits : [],
            colors: Array.isArray(message.colors) ? message.colors : [],
            segments: wallSegments(String(message.maze || ''), size),
            goals: Number(message.goals) || 0
        };
        this.dots = this.maze.colors.map(color => ({ x: 0, y: 0, tx: 0, ty: 0, color, gone: true, fresh: true }));
        this.buildLayer();
        this.wake();
    }

    buildLayer() {
        const { size: cells, segments, exits } = this.maze;
        const layer = document.createElement('canvas');
        layer.width = this.canvas.width;
        layer.height = this.canvas.height;
        const g = layer.getContext('2d');
        const pad = 0.5;
        const scale = (this.size - 2 * pad) / cells;
        g.setTransform(this.dpr, 0, 0, this.dpr, pad * this.dpr, pad * this.dpr);
        g.lineCap = 'square';
        g.lineWidth = Math.max(0.7, scale * 0.14);
        g.strokeStyle = WALL;
        g.beginPath();
        for (let i = 0; i < segments.length; i += 4) {
            g.moveTo(segments[i] * scale, segments[i + 1] * scale);
            g.lineTo(segments[i + 2] * scale, segments[i + 3] * scale);
        }
        g.stroke();
        // Targets: small diamonds.
        g.fillStyle = TARGET;
        const d = Math.max(1.4, scale * 0.42);
        for (const cell of exits) {
            const cx = ((cell % cells) + 0.5) * scale, cy = (Math.floor(cell / cells) + 0.5) * scale;
            g.beginPath();
            g.moveTo(cx, cy - d); g.lineTo(cx + d, cy); g.lineTo(cx, cy + d); g.lineTo(cx - d, cy);
            g.closePath(); g.fill();
        }
        this.layer = layer;
        this.scale = scale;
        this.pad = pad;
    }

    /** Racer positions from a `peek:frame`: cell index per racer, -1 when they have left. */
    setFrame({ pos, goals }) {
        if (!this.maze || !Array.isArray(pos)) return;
        const cells = this.maze.size;
        let leader = -1, best = -1;
        pos.forEach((cell, i) => {
            const dot = this.dots[i];
            if (!dot) return;
            if (cell < 0) { dot.gone = true; return; }
            dot.tx = (cell % cells) + 0.5;
            dot.ty = Math.floor(cell / cells) + 0.5;
            if (dot.gone || dot.fresh) { dot.x = dot.tx; dot.y = dot.ty; dot.fresh = false; }
            dot.gone = false;
            const g = Array.isArray(goals) ? Number(goals[i]) || 0 : 0;
            if (g > best) { best = g; leader = i; }
        });
        this.leader = leader;
        this.leaderGoals = Math.max(0, best);
        this.wake();
    }

    wake() {
        if (this.cancel) return;
        this.cancel = animate(dt => {
            const k = prefersReducedMotion() ? 1 : 1 - Math.exp(-dt * 9);
            let moving = false;
            for (const dot of this.dots) {
                if (dot.gone) continue;
                const dx = dot.tx - dot.x, dy = dot.ty - dot.y;
                if (Math.abs(dx) > 0.004 || Math.abs(dy) > 0.004) {
                    dot.x += dx * k; dot.y += dy * k;
                    moving = true;
                } else { dot.x = dot.tx; dot.y = dot.ty; }
            }
            this.draw();
            if (!moving) this.cancel = null;
            return moving;
        });
    }

    draw() {
        const { ctx, size, dpr } = this;
        if (!size) return;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (!this.layer) return;
        ctx.drawImage(this.layer, 0, 0);
        const crowd = this.dots.length > 20;
        const r = Math.max(1.5, this.scale * 0.36);
        ctx.setTransform(dpr, 0, 0, dpr, this.pad * dpr, this.pad * dpr);
        this.dots.forEach((dot, i) => {
            if (dot.gone) return;
            const x = dot.x * this.scale, y = dot.y * this.scale;
            ctx.save();
            if (!crowd) { ctx.shadowColor = dot.color; ctx.shadowBlur = r * 2.2; }
            ctx.fillStyle = dot.color;
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
            if (i === this.leader) {
                ctx.strokeStyle = '#ffd79a';
                ctx.lineWidth = Math.max(1, r * 0.4);
                ctx.beginPath(); ctx.arc(x, y, r * 1.9, 0, Math.PI * 2); ctx.stroke();
            }
        });
    }

    destroy() {
        if (this.cancel) { this.cancel(); this.cancel = null; }
    }
}
