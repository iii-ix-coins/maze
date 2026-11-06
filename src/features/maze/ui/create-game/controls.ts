/**
 * The four instruments of "Create Your Game". None of them accepts typed numbers:
 *   LensSlider  – drag a glass lens between three detents (maze size)
 *   Dial        – turn / flick a rotary dial, 1–99 (racers)
 *   Ruler       – slide an inertial ruler under a needle, 1–99 (targets)
 *   HoldButton  – press and hold to confirm
 * Each one is also fully keyboard operable and exposes slider semantics to assistive tech.
 */
import { Spring, animate, clamp, trackPointer, buzz, prefersReducedMotion } from './motion';

/* ── Odometer: rolling digits ─────────────────────────────────────────────── */
export class Odometer {
    declare root: any;
    declare columns: { column: HTMLSpanElement; strip: HTMLSpanElement; }[];
    declare value: any;

    constructor(root, digits = 2) {
        this.root = root;
        this.columns = [];
        root.classList.add('cg-odo');
        for (let i = 0; i < digits; i++) {
            const column = document.createElement('span');
            column.className = 'cg-odo-col';
            const strip = document.createElement('span');
            strip.className = 'cg-odo-strip';
            // Rows 0–9 are digits, row 10 is blank (used for the tens column below 10).
            for (let d = 0; d <= 10; d++) {
                const cell = document.createElement('span');
                cell.textContent = d === 10 ? '' : String(d);
                strip.append(cell);
            }
            column.append(strip);
            root.append(column);
            this.columns.push({ column, strip });
        }
        this.value = null;
    }
    set(value) {
        const v = Math.max(0, Math.round(value));
        if (v === this.value) return;
        this.value = v;
        const text = String(v).padStart(this.columns.length, ' ');
        this.columns.forEach(({ column, strip }, i) => {
            const ch = text[text.length - this.columns.length + i];
            const row = ch === ' ' ? 10 : Number(ch);
            // Each row is 1.02em tall (see .cg-odo-strip > span), so the offset must use the same unit.
            strip.style.transform = `translateY(${(-row * 1.02).toFixed(2)}em)`;
            column.classList.toggle('is-blank', row === 10);
        });
    }
}

/* ── Shared base for the three sliders ────────────────────────────────────── */
class SpringSlider {
    declare root: any;
    declare min: any;
    declare max: any;
    declare onChange: any;
    declare spring: Spring;
    declare current: number;
    declare dragging: boolean;
    declare touchDrag: boolean;
    declare stopLoop: any;
    declare ariaText: any;

    constructor({ min, max, value, onChange }) {
        this.min = min;
        this.max = max;
        this.onChange = onChange || (() => {});
        this.spring = new Spring(value, { stiffness: 170, damping: 2 * Math.sqrt(170) });
        this.spring.target = value;
        this.current = Math.round(value);
        this.dragging = false;
        this.touchDrag = false;
        this.stopLoop = null;
    }
    get value() { return this.current; }
    /** Screen readers hear the resting value, not every number the animation passes through. */
    syncAria() {
        this.root.setAttribute('aria-valuenow', String(clamp(Math.round(this.spring.target), this.min, this.max)));
        if (this.ariaText != null) this.root.setAttribute('aria-valuetext', this.ariaText);
    }
    setAriaText(text) {
        this.ariaText = text;
        if (!this.stopLoop && !this.dragging) this.syncAria();
    }
    /** Moves to an integer value, animated. */
    setValue(v, { animateTo = true }: any = {}) {
        const next = clamp(Math.round(v), this.min, this.max);
        this.spring.target = next;
        if (!animateTo) this.spring.jump(next);
        this.emitIfChanged();
        this.syncAria();
        this.wake();
        return next;
    }
    nudge(delta) { return this.setValue(Math.round(this.spring.target) + delta); }
    wake() {
        if (this.stopLoop) return;
        this.stopLoop = animate(dt => {
            const moving = this.dragging ? (this.spring.step(dt), true) : this.spring.step(dt);
            this.render(this.spring.value);
            this.emitIfChanged(this.dragging && this.touchDrag);
            if (!moving) { this.stopLoop = null; this.settled(); }
            return moving;
        });
    }
    emitIfChanged(buzzOnTouch = false) {
        const rounded = clamp(Math.round(this.spring.value), this.min, this.max);
        if (rounded !== this.current) {
            this.current = rounded;
            if (buzzOnTouch) buzz();
            this.onChange(rounded);
        }
    }
    /** After a drag (or a tap): fling from where the pointer left it to a projected resting value. */
    release(velocityInValueUnits) {
        this.dragging = false;
        const projected = this.spring.target + clamp(velocityInValueUnits, -400, 400) * 0.22;
        const target = clamp(Math.round(projected), this.min, this.max);
        this.spring.target = target;
        this.spring.velocity = clamp(velocityInValueUnits, -400, 400);
        this.syncAria();
        this.wake();
    }
    render(_value?: any) {}
    settled() { this.syncAria(); }
}

/* ── LensSlider ───────────────────────────────────────────────────────────── */
const LENS_TINTS = [[139, 224, 164], [255, 215, 154], [255, 155, 138]];

export class LensSlider extends SpringSlider {
    declare root: any;
    declare onFrame: any;
    declare tintHost: any;
    declare track: any;
    declare thumb: any;
    declare fill: any;
    declare trackWidth: number;
    declare grabOffset: number;
    declare thumbW: number;
    declare dragging: boolean;
    declare touchDrag: boolean;
    declare lastWheel: number;

    constructor(root, { index = 1, onChange, onFrame }: any = {}) {
        super({ min: 0, max: 2, value: index, onChange });
        this.root = root;
        this.onFrame = onFrame || (() => {});
        this.tintHost = root.closest('.cg-step') || root;
        this.track = root.querySelector('.cg-lens-track');
        this.thumb = root.querySelector('.cg-lens-thumb');
        this.fill = root.querySelector('.cg-lens-fill');
        this.trackWidth = 1;
        this.grabOffset = 0;
        this.thumbW = 44;

        new ResizeObserver(() => { this.measure(); this.render(this.spring.value); }).observe(this.track);
        this.measure();

        trackPointer(root, {
            onStart: e => {
                this.dragging = true;
                this.touchDrag = e.pointerType === 'touch';
                root.classList.add('is-dragging');
                const thumbRect = this.thumb.getBoundingClientRect();
                const onThumb = e.clientX >= thumbRect.left - 6 && e.clientX <= thumbRect.right + 6;
                // Grabbing the lens keeps it under the finger; tapping elsewhere pulls it to that spot.
                this.grabOffset = onThumb ? (thumbRect.left + thumbRect.width / 2 - e.clientX) : 0;
                this.spring.target = clamp(this.toT(e.clientX), 0, 2);
                this.wake();
                root.focus({ preventScroll: true });
            },
            onMove: e => { this.spring.target = clamp(this.toT(e.clientX), 0, 2); },
            onEnd: (e, v) => {
                root.classList.remove('is-dragging');
                this.spring.target = clamp(this.toT(e.clientX), 0, 2);
                this.release(v.x / Math.max(1, this.trackWidth) * 2);
            }
        });
        root.addEventListener('keydown', e => {
            const delta = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
            if (delta) { e.preventDefault(); this.nudge(delta); }
            else if (e.key === 'Home') { e.preventDefault(); this.setValue(0); }
            else if (e.key === 'End') { e.preventDefault(); this.setValue(2); }
        });
        root.addEventListener('wheel', e => {
            e.preventDefault();
            const now = performance.now();
            if (now - (this.lastWheel || 0) < 180) return;
            this.lastWheel = now;
            this.nudge((e.deltaY || e.deltaX) > 0 ? 1 : -1);
        }, { passive: false });
        this.render(this.spring.value);
    }
    /** Pointer x → continuous position 0..2 along the track (thumb centres, not edges). */
    toT(clientX) {
        const rect = this.track.getBoundingClientRect();
        return ((clientX + this.grabOffset - rect.left - this.thumbW / 2) / Math.max(1, this.trackWidth)) * 2;
    }
    measure() {
        const thumbW = this.thumb.offsetWidth || 44;
        this.trackWidth = Math.max(1, this.track.clientWidth - thumbW);
        this.thumbW = thumbW;
    }
    render(t) {
        t = clamp(t, 0, 2);
        const x = (t / 2) * this.trackWidth;
        this.thumb.style.transform = `translate3d(${x}px, -50%, 0)`;
        this.fill.style.transform = `scaleX(${(t / 2).toFixed(4)})`;
        const i = Math.min(1, Math.floor(t));
        const f = t - i;
        const a = LENS_TINTS[i], b = LENS_TINTS[Math.min(2, i + 1)];
        // The tint is shared with the size readout, so it lives on the whole step.
        this.tintHost.style.setProperty('--tint', `${Math.round(a[0] + (b[0] - a[0]) * f)} ${Math.round(a[1] + (b[1] - a[1]) * f)} ${Math.round(a[2] + (b[2] - a[2]) * f)}`);
        this.onFrame(t);
    }
    /** Moves to an index without animation (used when restoring a saved set-up). */
    jumpTo(index) {
        this.spring.jump(index);
        this.current = index;
        this.syncAria();
        this.render(index);
    }
}

/* ── Dial ─────────────────────────────────────────────────────────────────── */
const SWEEP = 270;           // degrees of travel
const START_ANGLE = -135;    // angle of the minimum, 0° = straight up, clockwise positive

export class Dial extends SpringSlider {
    declare root: any;
    declare knob: any;
    declare ticksGroup: any;
    declare span: number;
    declare degPerStep: number;
    declare ticks: any;
    declare litUpTo: number;
    declare lastAngle: number;
    declare angleValue: number;
    declare dragging: boolean;
    declare touchDrag: boolean;

    constructor(root, { min = 1, max = 99, value = 1, onChange }: any = {}) {
        super({ min, max, value, onChange });
        this.root = root;
        this.knob = root.querySelector('.cg-dial-knob');
        this.ticksGroup = root.querySelector('.cg-dial-ticks');
        this.span = max - min;
        this.degPerStep = SWEEP / this.span;
        this.ticks = [];
        this.litUpTo = -1;
        this.buildTicks();
        this.lastAngle = 0;
        this.angleValue = value;

        trackPointer(root, {
            // Anywhere on the dial except its dead centre (where an angle is meaningless).
            accept: e => {
                const rect = root.getBoundingClientRect();
                const r = Math.hypot(e.clientX - (rect.left + rect.width / 2), e.clientY - (rect.top + rect.height / 2));
                return r > rect.width * 0.14;
            },
            onStart: e => {
                this.dragging = true;
                this.touchDrag = e.pointerType === 'touch';
                root.classList.add('is-dragging');
                this.lastAngle = this.pointerAngle(e);
                this.spring.target = this.spring.value;
                this.spring.velocity = 0;
                this.wake();
                root.focus({ preventScroll: true });
            },
            onMove: e => {
                const a = this.pointerAngle(e);
                let delta = a - this.lastAngle;
                if (delta > 180) delta -= 360;
                if (delta < -180) delta += 360;
                this.lastAngle = a;
                // Grab-and-turn: the knob follows the finger one-to-one.
                const next = clamp(this.spring.target + delta / this.degPerStep, this.min, this.max);
                this.spring.target = next;
            },
            onEnd: (e, v) => {
                root.classList.remove('is-dragging');
                // Convert the pointer's tangential velocity into degrees/second, then into steps/second.
                const rect = root.getBoundingClientRect();
                const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
                const rx = e.clientX - cx, ry = e.clientY - cy;
                const radius = Math.max(24, Math.hypot(rx, ry));
                const angularDeg = ((rx * v.y - ry * v.x) / (radius * radius)) * (180 / Math.PI);
                this.release(angularDeg / this.degPerStep);
            }
        });
        // While dragging the spring should track the pointer tightly.
        const baseStep = this.spring.step.bind(this.spring);
        this.spring.step = dt => {
            if (this.dragging) {
                const follow = 1 - Math.exp(-dt * 40);
                this.spring.value += (this.spring.target - this.spring.value) * follow;
                this.spring.velocity = 0;
                return true;
            }
            return baseStep(dt);
        };
        root.addEventListener('keydown', e => {
            const small = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
            const big = { PageUp: 10, PageDown: -10 }[e.key];
            if (small || big) { e.preventDefault(); this.nudge(small || big); }
            else if (e.key === 'Home') { e.preventDefault(); this.setValue(this.min); }
            else if (e.key === 'End') { e.preventDefault(); this.setValue(this.max); }
        });
        let wheelAcc = 0;
        root.addEventListener('wheel', e => {
            e.preventDefault();
            wheelAcc += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
            const steps = Math.trunc(wheelAcc / 36);
            if (steps) { wheelAcc -= steps * 36; this.nudge(-steps); }
        }, { passive: false });
        this.render(this.spring.value);
    }
    pointerAngle(e) {
        const rect = this.root.getBoundingClientRect();
        return Math.atan2(e.clientX - (rect.left + rect.width / 2), -(e.clientY - (rect.top + rect.height / 2))) * 180 / Math.PI;
    }
    buildTicks() {
        const NS = 'http://www.w3.org/2000/svg';
        for (let v = this.min; v <= this.max; v++) {
            const angle = (START_ANGLE + (v - this.min) * this.degPerStep) * Math.PI / 180;
            const major = v % 10 === 0 || v === this.min || v === this.max;
            const mid = !major && v % 5 === 0;
            const r1 = 124, r0 = major ? 108 : mid ? 112 : 116;
            const line = document.createElementNS(NS, 'line');
            line.setAttribute('x1', (Math.sin(angle) * r0).toFixed(2));
            line.setAttribute('y1', (-Math.cos(angle) * r0).toFixed(2));
            line.setAttribute('x2', (Math.sin(angle) * r1).toFixed(2));
            line.setAttribute('y2', (-Math.cos(angle) * r1).toFixed(2));
            line.setAttribute('class', major ? 'tick major' : 'tick');
            this.ticksGroup.append(line);
            this.ticks.push(line);
        }
    }
    render(v) {
        const angle = START_ANGLE + (v - this.min) * this.degPerStep;
        this.knob.style.transform = `rotate(${angle.toFixed(2)}deg)`;
        const lit = clamp(Math.round(v), this.min, this.max) - this.min;
        if (lit !== this.litUpTo) {
            const from = Math.min(lit, this.litUpTo < 0 ? 0 : this.litUpTo);
            const to = Math.max(lit, this.litUpTo < 0 ? this.ticks.length - 1 : this.litUpTo);
            for (let i = from; i <= to; i++) {
                this.ticks[i].classList.toggle('lit', i <= lit);
                this.ticks[i].classList.toggle('now', i === lit);
            }
            this.litUpTo = lit;
        }
    }
    jumpTo(value) {
        this.spring.jump(value);
        this.current = value;
        this.litUpTo = -1;
        this.syncAria();
        this.render(value);
    }
}

/* ── Ruler ────────────────────────────────────────────────────────────────── */
export class Ruler extends SpringSlider {
    declare root: any;
    declare strip: any;
    declare gap: number;
    declare ticks: any;
    declare touched: any;
    declare pxPerUnit: number;
    declare dragging: boolean;
    declare touchDrag: boolean;

    constructor(root, { min = 1, max = 99, value = 3, onChange }: any = {}) {
        super({ min, max, value, onChange });
        this.root = root;
        this.strip = root.querySelector('.cg-ruler-strip');
        this.gap = 15;
        this.ticks = [];
        this.touched = [];
        this.buildTicks();
        this.pxPerUnit = this.gap;

        trackPointer(root, {
            onStart: e => {
                this.dragging = true;
                this.touchDrag = e.pointerType === 'touch';
                root.classList.add('is-dragging');
                this.spring.target = this.spring.value;
                this.spring.velocity = 0;
                this.wake();
                root.focus({ preventScroll: true });
            },
            onMove: (e, samples) => {
                const prev = samples[samples.length - 2] || samples[0];
                const dx = e.clientX - prev.x;
                // The ruler moves with the finger, so dragging right lowers the value.
                this.spring.target = clamp(this.spring.target - dx / this.gap, this.min, this.max);
            },
            onEnd: (e, v) => {
                root.classList.remove('is-dragging');
                this.release(-v.x / this.gap);
            }
        });
        const baseStep = this.spring.step.bind(this.spring);
        this.spring.step = dt => {
            if (this.dragging) {
                const follow = 1 - Math.exp(-dt * 40);
                this.spring.value += (this.spring.target - this.spring.value) * follow;
                this.spring.velocity = 0;
                return true;
            }
            return baseStep(dt);
        };
        root.addEventListener('keydown', e => {
            const small = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
            const big = { PageUp: 10, PageDown: -10 }[e.key];
            if (small || big) { e.preventDefault(); this.nudge(small || big); }
            else if (e.key === 'Home') { e.preventDefault(); this.setValue(this.min); }
            else if (e.key === 'End') { e.preventDefault(); this.setValue(this.max); }
        });
        let wheelAcc = 0;
        root.addEventListener('wheel', e => {
            e.preventDefault();
            wheelAcc += (e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY) + e.deltaX;
            const steps = Math.trunc(wheelAcc / 30);
            if (steps) { wheelAcc -= steps * 30; this.nudge(steps); }
        }, { passive: false });
        this.render(this.spring.value);
    }
    buildTicks() {
        const frag = document.createDocumentFragment();
        for (let v = this.min; v <= this.max; v++) {
            const tick = document.createElement('i');
            const major = v % 10 === 0 || v === this.min || v === this.max;
            tick.className = major ? 'tick major' : v % 5 === 0 ? 'tick mid' : 'tick';
            tick.style.left = `${(v - this.min) * this.gap}px`;
            if (major) {
                const label = document.createElement('b');
                label.textContent = String(v);
                tick.append(label);
            }
            frag.append(tick);
            this.ticks.push(tick);
        }
        this.strip.style.width = `${(this.max - this.min) * this.gap}px`;
        this.strip.append(frag);
    }
    render(v) {
        this.strip.style.transform = `translate3d(${(-(v - this.min) * this.gap).toFixed(2)}px, 0, 0)`;
        // Fisheye: ticks swell as the needle passes over them.
        const center = Math.round(v - this.min);
        for (const i of this.touched) this.ticks[i].style.removeProperty('--swell');
        this.touched.length = 0;
        for (let i = Math.max(0, center - 7); i <= Math.min(this.ticks.length - 1, center + 7); i++) {
            const d = i - (v - this.min);
            this.ticks[i].style.setProperty('--swell', Math.exp(-(d * d) / 7).toFixed(3));
            this.touched.push(i);
        }
    }
    jumpTo(value) {
        this.spring.jump(value);
        this.current = value;
        this.syncAria();
        this.render(value);
    }
}

/* ── HoldButton ───────────────────────────────────────────────────────────── */
export class HoldButton {
    declare button: any;
    declare duration: number;
    declare onProgress: any;
    declare onComplete: any;
    declare progress: number;
    declare holding: boolean;
    declare done: boolean;
    declare stop: any;

    constructor(button, { duration = 850, onProgress, onComplete }: any = {}) {
        this.button = button;
        this.duration = prefersReducedMotion() ? Math.min(duration, 500) : duration;
        this.onProgress = onProgress || (() => {});
        this.onComplete = onComplete || (() => {});
        this.progress = 0;
        this.holding = false;
        this.done = false;
        this.stop = null;

        button.addEventListener('pointerdown', e => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            try { button.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
            this.begin();
        });
        for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
            button.addEventListener(type, () => this.cancel());
        }
        button.addEventListener('keydown', e => {
            if (e.key !== ' ' && e.key !== 'Enter') return;
            e.preventDefault();
            if (!e.repeat) this.begin();
        });
        button.addEventListener('keyup', e => {
            if (e.key !== ' ' && e.key !== 'Enter') return;
            e.preventDefault();
            this.cancel();
        });
        button.addEventListener('blur', () => this.cancel());
        // Assistive tech activates a button with a plain click (detail 0, no key events).
        button.addEventListener('click', e => {
            if (e.detail === 0 && !this.done) { this.progress = 1; this.finish(); }
        });
        button.addEventListener('contextmenu', e => e.preventDefault());
    }
    reset() {
        this.cancel();
        this.progress = 0;
        this.done = false;
        this.onProgress(0, 'idle');
    }
    begin() {
        if (this.done) return;
        this.holding = true;
        this.button.classList.add('is-holding');
        this.run();
    }
    cancel() {
        if (!this.holding) return;
        this.holding = false;
        this.button.classList.remove('is-holding');
        if (!this.done) {
            this.run();
            if (this.progress > 0.2) {
                this.button.classList.remove('is-shaking');
                void this.button.offsetWidth;
                this.button.classList.add('is-shaking');
            }
        }
    }
    run() {
        if (this.stop) return;
        this.stop = animate(dt => {
            if (this.holding) this.progress = Math.min(1, this.progress + (dt * 1000) / this.duration);
            else this.progress = Math.max(0, this.progress - dt * 2.6);
            this.onProgress(this.progress, this.holding ? 'holding' : 'releasing');
            if (this.holding && this.progress >= 1) {
                this.stop = null;
                this.finish();
                return false;
            }
            const keep = this.holding || this.progress > 0;
            if (!keep) this.stop = null;
            return keep;
        });
    }
    finish() {
        if (this.done) return;
        this.done = true;
        this.holding = false;
        this.button.classList.remove('is-holding');
        this.onProgress(1, 'done');
        this.onComplete();
    }
}
