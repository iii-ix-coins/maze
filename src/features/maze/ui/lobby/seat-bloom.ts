/**
 * The "seat bloom": a room drawn as a ring (small rooms) or a sunflower (big ones) of seats. Taken seats glow in
 * their racer's colour; empty seats are hollow, and the next free seat breathes softly. When somebody joins, their
 * seat blooms open with a little overshoot; when somebody leaves it closes again.
 */
import { seatLayout } from './lobby-model';
import { animate, easeOutBack, prefersReducedMotion } from '../create-game/motion';

export class SeatBloom {
    declare canvas: HTMLCanvasElement;
    declare ctx: any;
    declare pulse: boolean;
    declare active: boolean;
    declare capacity: number;
    declare layout: any;
    declare seats: any;
    declare size: number;
    declare dpr: number;
    declare cancel: any;

    /**
     * @param {HTMLCanvasElement} canvas
     * @param {{pulse?: boolean}} options pulse = keep animating the next free seat (use for one big bloom only)
     */
    constructor(canvas, { pulse = false }: any = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.pulse = pulse;
        this.active = true;
        this.capacity = 0;
        this.layout = null;
        this.seats = new Map(); // seat index → { color, you, t }
        this.size = 0;
        this.dpr = 1;
        this.cancel = null;
        this.resize();
    }

    resize() {
        const cssSize = this.canvas.clientWidth || Number(this.canvas.getAttribute('width')) || 88;
        const dpr = Math.min(2.5, window.devicePixelRatio || 1);
        const px = Math.max(1, Math.round(cssSize * dpr));
        if (this.canvas.width !== px) { this.canvas.width = px; this.canvas.height = px; }
        this.size = cssSize;
        this.dpr = px / cssSize;
        this.draw(performance.now());
    }

    /** @param {number} capacity @param {{seat:number,color:string,you?:boolean}[]} taken */
    set(capacity, taken) {
        if (capacity !== this.capacity) {
            this.capacity = capacity;
            this.layout = seatLayout(capacity);
        }
        const next = new Map<any, any>(taken.map(entry => [entry.seat, entry]));
        const instant = prefersReducedMotion();
        for (const [seat, info] of next) {
            const current = this.seats.get(seat);
            if (!current) this.seats.set(seat, { color: info.color, you: !!info.you, t: instant ? 1 : 0, leaving: false });
            else { current.color = info.color; current.you = !!info.you; current.leaving = false; }
        }
        for (const [seat, current] of this.seats) {
            if (!next.has(seat)) { if (instant) this.seats.delete(seat); else current.leaving = true; }
        }
        this.wake();
    }

    setActive(active) {
        this.active = active;
        if (active) this.wake();
    }

    wake() {
        if (this.cancel) return;
        this.cancel = animate((dt, now) => {
            let busy = false;
            for (const [seat, s] of this.seats) {
                if (s.leaving) {
                    s.t -= dt / 0.28;
                    if (s.t <= 0) this.seats.delete(seat); else busy = true;
                } else if (s.t < 1) {
                    s.t = Math.min(1, s.t + dt / 0.55);
                    busy = true;
                }
            }
            this.draw(now);
            const keep = busy || (this.pulse && this.active && !prefersReducedMotion() && this.hasFreeSeat());
            if (!keep) this.cancel = null;
            return keep;
        });
    }

    hasFreeSeat() {
        for (let i = 0; i < this.capacity; i++) { const s = this.seats.get(i); if (!s || s.leaving) return true; }
        return false;
    }

    draw(now) {
        const { ctx, size, dpr, layout } = this;
        if (!layout || !size) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, size, size);
        const half = size / 2;
        const unit = half * 0.96;
        const r = layout.radius * unit;
        const glow = this.capacity <= 24 && r > 5;
        let nextFree = -1;
        for (let i = 0; i < this.capacity; i++) { const s = this.seats.get(i); if (!s || s.leaving) { nextFree = i; break; } }

        for (let i = 0; i < this.capacity; i++) {
            const p = layout.points[i];
            const x = half + p.x * unit, y = half + p.y * unit;
            const s = this.seats.get(i);
            if (!s || (s.leaving && s.t < 0.55)) {
                // An empty seat: a faint ring, or just a dot when seats are tiny.
                ctx.save();
                ctx.globalAlpha = s ? 1 - s.t : 1;
                if (r < 5) {
                    ctx.fillStyle = 'rgba(228, 246, 234, .16)';
                    ctx.beginPath(); ctx.arc(x, y, Math.max(1, r * 0.5), 0, Math.PI * 2); ctx.fill();
                } else {
                    ctx.strokeStyle = 'rgba(228, 246, 234, .28)';
                    ctx.lineWidth = 1.2;
                    ctx.setLineDash([2.5, 3]);
                    ctx.beginPath(); ctx.arc(x, y, r * 0.84, 0, Math.PI * 2); ctx.stroke();
                }
                ctx.restore();
                if (i === nextFree && this.pulse && !prefersReducedMotion()) {
                    const breath = 0.5 + 0.5 * Math.sin(now / 480);
                    ctx.save();
                    ctx.strokeStyle = `rgba(255, 215, 154, ${0.25 + 0.55 * breath})`;
                    ctx.lineWidth = 1.6;
                    ctx.beginPath(); ctx.arc(x, y, r * (0.95 + 0.28 * breath), 0, Math.PI * 2); ctx.stroke();
                    ctx.restore();
                }
                if (!s) continue;
            }
            const t = Math.max(0, Math.min(1, s.t));
            const scale = s.leaving ? t : Math.max(0, easeOutBack(t));
            const rr = r * scale;
            if (rr <= 0.1) continue;
            ctx.save();
            if (glow) { ctx.shadowColor = s.color; ctx.shadowBlur = rr * 0.9; }
            ctx.fillStyle = s.color;
            ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
            if (r >= 5) {
                ctx.fillStyle = 'rgba(255, 255, 255, .38)';
                ctx.beginPath(); ctx.arc(x - rr * 0.28, y - rr * 0.3, rr * 0.26, 0, Math.PI * 2); ctx.fill();
            }
            if (s.you) {
                ctx.strokeStyle = '#ff9b8a';
                ctx.lineWidth = Math.max(1.4, r * 0.16);
                ctx.beginPath(); ctx.arc(x, y, rr + Math.max(2, r * 0.3), 0, Math.PI * 2); ctx.stroke();
            }
        }
    }

    destroy() {
        if (this.cancel) { this.cancel(); this.cancel = null; }
    }
}
