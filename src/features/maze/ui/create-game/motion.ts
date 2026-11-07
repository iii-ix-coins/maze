/**
 * Tiny, dependency-free motion toolkit for the Create-Game flow:
 * a shared animation loop, a damped spring and a pointer-drag helper with release velocity.
 * Everything honours prefers-reduced-motion.
 */
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
export const easeOutBack = t => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

const reducedQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
export const prefersReducedMotion = () => !!(reducedQuery && reducedQuery.matches);

/* ── Shared frame loop ───────────────────────────────────────────────────────
   A callback returns true to keep running and false when it has settled, so the
   page stays completely idle while nothing is moving. */
const running = new Set<any>();
let rafId = 0;
let lastFrame = 0;

function loop(now) {
    const dt = Math.min(0.05, Math.max(0.001, (now - lastFrame) / 1000));
    lastFrame = now;
    for (const fn of [...running]) {
        let keep = false;
        try { keep = fn(dt, now); } catch (error) { console.error(error); }
        if (!keep) running.delete(fn);
    }
    rafId = running.size ? requestAnimationFrame(loop) : 0;
}

/** Runs `fn(dt, now)` every frame until it returns a falsy value. Returns a cancel function. */
export function animate(fn) {
    running.add(fn);
    if (!rafId) {
        lastFrame = performance.now();
        rafId = requestAnimationFrame(loop);
    }
    return () => running.delete(fn);
}

/* ── Damped spring ───────────────────────────────────────────────────────────
   Critically damped by default: it settles fast without wobbling. Seeding a release
   velocity and a projected target gives the familiar "flick, then settle" feel. */
export class Spring {
    declare value: number;
    declare target: number;
    declare velocity: number;
    declare stiffness: number;
    declare damping: number;
    declare precision: number;

    constructor(value = 0, { stiffness = 150, damping = 2 * Math.sqrt(150), precision = 0.0008 } = {}) {
        this.value = value;
        this.target = value;
        this.velocity = 0;
        this.stiffness = stiffness;
        this.damping = damping;
        this.precision = precision;
    }
    jump(value) {
        this.value = this.target = value;
        this.velocity = 0;
    }
    /** Advances the simulation; returns true while it is still moving. */
    step(dt) {
        if (prefersReducedMotion()) {
            const moved = this.value !== this.target;
            this.jump(this.target);
            return moved;
        }
        const substeps = Math.max(1, Math.ceil(dt / (1 / 120)));
        const h = dt / substeps;
        for (let i = 0; i < substeps; i++) {
            const accel = -this.stiffness * (this.value - this.target) - this.damping * this.velocity;
            this.velocity += accel * h;
            this.value += this.velocity * h;
        }
        if (Math.abs(this.value - this.target) < this.precision && Math.abs(this.velocity) < this.precision * 20) {
            this.value = this.target;
            this.velocity = 0;
            return false;
        }
        return true;
    }
}

/* ── Pointer drag with release velocity ──────────────────────────────────────
   Calls onStart(e) / onMove(e, samples) / onEnd(e, velocity). `velocity` is
   {x, y} in px per second, measured over the last ~90 ms of the gesture. */
export function trackPointer(el, { onStart, onMove, onEnd, accept = (_e?: any) => true }: any) {
    let activeId = null;
    let samples = [];
    const record = e => {
        const now = performance.now();
        samples.push({ t: now, x: e.clientX, y: e.clientY });
        while (samples.length > 2 && now - samples[0].t > 90) samples.shift();
    };
    const velocity = () => {
        if (samples.length < 2) return { x: 0, y: 0 };
        const a = samples[0], b = samples[samples.length - 1];
        const dt = (b.t - a.t) / 1000;
        if (dt <= 0.005 || performance.now() - b.t > 120) return { x: 0, y: 0 };
        return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
    };
    el.addEventListener('pointerdown', (e: any) => {
        if (activeId !== null || (e.pointerType === 'mouse' && e.button !== 0) || !accept(e)) return;
        activeId = e.pointerId;
        samples = [];
        record(e);
        try { el.setPointerCapture(e.pointerId); } catch (_) { /* element may be detached */ }
        onStart && onStart(e);
    });
    el.addEventListener('pointermove', e => {
        if (e.pointerId !== activeId) return;
        record(e);
        onMove && onMove(e, samples);
    });
    const finish = e => {
        if (e.pointerId !== activeId) return;
        activeId = null;
        record(e);
        const v = velocity();
        samples = [];
        onEnd && onEnd(e, v);
    };
    el.addEventListener('pointerup', finish);
    el.addEventListener('pointercancel', finish);
    el.addEventListener('lostpointercapture', finish);
}

/** Short haptic tick on touch devices; silently ignored elsewhere. */
let lastBuzz = 0;
export function buzz(ms = 6) {
    const now = performance.now();
    if (now - lastBuzz < 28 || prefersReducedMotion()) return;
    lastBuzz = now;
    try { navigator.vibrate && navigator.vibrate(ms); } catch (_) { /* unsupported */ }
}
