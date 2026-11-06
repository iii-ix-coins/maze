/**
 * The progress rail of the Create-Game flow, built like a game's level map:
 * four rounded-square tiles on a track, each with its own icon and colour.
 *
 *   locked    not reached yet: dashed outline, dimmed icon
 *   ready     reached before, but you are somewhere else: solid, tinted icon
 *   active    where you are: lit up, lifted, with a pulsing ring
 *   done      a step you have left behind: a check badge is stamped on the corner
 *
 * This component owns the rail's DOM only. The wizard tells it where the player is (`setStep`),
 * what they chose (`setValues`) and whether the launch button is being held (`setCharging`).
 * Icons come from `icons.js`; the markup only carries `data-icon` names.
 */
import { STEP_ICONS, iconUrl } from './icons';
import { prefersReducedMotion } from './motion';

const EASE = 'cubic-bezier(.2, .8, .2, 1)';
const SPRING = 'cubic-bezier(.34, 1.56, .64, 1)';

const make = (tag, className) => {
    const el = document.createElement(tag);
    el.className = className;
    return el;
};

/** Points an element at an icon. The CSS decides whether it is a stencil or a plain picture. */
function paintIcon(el, name) {
    const icon = STEP_ICONS[name];
    el.style.setProperty('--icon', `url("${iconUrl(name)}")`);
    el.style.setProperty('--ico-scale', String(icon.fit));
    el.classList.toggle('is-tinted', icon.tint);
    return el;
}

/** Resolves once every icon has been fetched, so tiles never show half-loaded artwork. */
export function preloadIcons(names = Object.keys(STEP_ICONS)) {
    return Promise.all(names.map(name => new Promise(resolve => {
        const image = new Image();
        image.onload = () => resolve(true);
        image.onerror = () => {
            console.warn(`[create-game] icon "${name}" could not be loaded from ${iconUrl(name)}`);
            resolve(false);
        };
        image.src = iconUrl(name);
    })));
}

/** A handful of rounded-square sparks that fly out of a tile. They take the tile's own colour. */
function burst(node, { count = 10, distance = 50 }: any = {}) {
    if (prefersReducedMotion() || !node.animate) return;
    for (let i = 0; i < count; i++) {
        const spark = make('i', 'cg-spark');
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.7;
        const reach = distance * (0.7 + Math.random() * 0.6);
        const dx = Math.cos(angle) * reach;
        const dy = Math.sin(angle) * reach;
        const spin = (Math.random() - 0.5) * 260;
        const size = 5 + Math.random() * 4;
        spark.style.width = spark.style.height = `${size.toFixed(1)}px`;
        node.append(spark);
        const flight = spark.animate([
            { transform: 'translate(-50%, -50%) scale(.2) rotate(0deg)', opacity: 1 },
            { transform: `translate(calc(-50% + ${dx.toFixed(1)}px), calc(-50% + ${dy.toFixed(1)}px)) scale(1) rotate(${spin.toFixed(0)}deg)`, opacity: 1, offset: 0.55 },
            { transform: `translate(calc(-50% + ${(dx * 1.22).toFixed(1)}px), calc(-50% + ${(dy * 1.22 + 12).toFixed(1)}px)) scale(.1) rotate(${(spin * 1.5).toFixed(0)}deg)`, opacity: 0 }
        ], { duration: 560 + Math.random() * 220, easing: EASE, fill: 'both' });
        flight.onfinish = flight.oncancel = () => spark.remove();
    }
}

export class StepRail {
    declare list: any;
    declare onSelect: any;
    declare buttons: any;
    declare step: number;
    declare maxStep: number;
    declare chipText: any;

    constructor(list, { onSelect }: any = {}) {
        this.list = list;
        this.onSelect = onSelect || (() => {});
        this.buttons = [...list.querySelectorAll('.cg-rail-btn')];
        this.step = -1;          // nothing painted yet
        this.maxStep = -1;
        this.chipText = [];

        this.buttons.forEach((button, index) => {
            const node = button.querySelector('.cg-node');
            node.append(
                paintIcon(make('i', 'cg-ico'), button.dataset.icon),
                paintIcon(make('i', 'cg-ico cg-badge'), 'check')
            );
            button.addEventListener('click', () => this.onSelect(index));
        });

        // The shine is a CSS animation on a tile's pseudo-element; one listener on the rail cleans up after all of them.
        list.addEventListener('animationend', event => {
            if (event.animationName === 'cgShine') event.target.classList.remove('is-shining');
        });

        // Until the artwork has arrived the icons stay invisible instead of flashing as solid blocks.
        preloadIcons().then(() => list.classList.add('is-ready'));
    }

    get lastIndex() { return this.buttons.length - 1; }
    nodeOf(index) { return this.buttons[index].querySelector('.cg-node'); }

    /** `step` is the tile you are on, `maxStep` the furthest one you have reached. */
    setStep(step, maxStep, { instant = false }: any = {}) {
        const before = { step: this.step, maxStep: this.maxStep };
        this.step = step;
        this.maxStep = maxStep;
        this.list.style.setProperty('--cg-progress', String(step / this.lastIndex));

        this.buttons.forEach((button, i) => {
            button.classList.toggle('is-active', i === step);
            button.classList.toggle('is-done', i < step);
            button.classList.toggle('is-visited', i <= maxStep);
            button.disabled = i > maxStep;
            if (i === step) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
        });

        if (instant || before.step < 0) return;
        // Tiles you just walked past are completed; tiles you reach for the first time unlock.
        for (let i = Math.max(0, before.step); i < step; i++) this.complete(i);
        for (let i = before.maxStep + 1; i <= maxStep; i++) this.unlock(i);
    }

    /** What the player picked, shown as a small chip under each tile. */
    setValues(values) {
        values.forEach((value, i) => {
            const chip = this.buttons[i].querySelector('[data-rail-value]');
            const text = value == null ? '' : String(value);
            const seen = this.chipText[i] !== undefined;
            this.chipText[i] = text;
            if (chip.textContent === text) return;
            chip.textContent = text;
            if (seen && text) {
                chip.classList.remove('is-bump');
                void chip.offsetWidth;      // restart the animation
                chip.classList.add('is-bump');
            }
        });
    }

    /** The launch tile rumbles while its button is held (the exhaust glow follows --charge in CSS). */
    setCharging(on) {
        this.buttons[this.lastIndex].classList.toggle('is-charging', Boolean(on));
    }

    complete(index) {
        const node = this.nodeOf(index);
        burst(node);
        if (prefersReducedMotion() || !node.animate) return;
        node.animate([
            { scale: '1 1' },
            { scale: '1.16 .86', offset: 0.22 },
            { scale: '.94 1.08', offset: 0.5 },
            { scale: '1 1' }
        ], { duration: 460, easing: 'ease-out' });
    }

    unlock(index) {
        const node = this.nodeOf(index);
        if (prefersReducedMotion() || !node.animate) return;
        node.animate([
            { scale: '.78', opacity: 0.35 },
            { scale: '1.12', opacity: 1, offset: 0.6 },
            { scale: '1', opacity: 1 }
        ], { duration: 520, easing: SPRING });
        node.classList.remove('is-shining');
        void node.offsetWidth;
        node.classList.add('is-shining');
    }
}
