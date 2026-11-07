/**
 * Keyed list with FLIP animation: cards that stay slide to their new place, new cards bloom in, cards that go
 * away shrink out. Content is up to the caller (`create` / `update`); this only orchestrates the DOM.
 */
import { prefersReducedMotion } from '../create-game/motion';

const EASE = 'cubic-bezier(.2, .8, .2, 1)';

export class CardList {
    declare container: HTMLElement;
    declare create: any;
    declare update: any;
    declare key: any;
    declare cards: any;
    declare leaving: any;

    /**
     * @param {HTMLElement} container
     * @param {{create:(item:any)=>HTMLElement, update:(el:HTMLElement,item:any,prev:any)=>void, key?:(item:any)=>string}} hooks
     */
    constructor(container, { create, update, key = item => item.id }) {
        this.container = container;
        this.create = create;
        this.update = update;
        this.key = key;
        this.cards = new Map();   // key → { el, item }
        this.leaving = new Set();
    }

    /** Reconciles the list with `items` (already filtered and sorted). `changed` lists keys whose data changed. */
    render(items) {
        const animate = !prefersReducedMotion() && this.container.isConnected && this.container.offsetParent !== null;
        const before = animate ? this.measure() : null;
        const wanted = new Set();
        const ordered = [];
        const entering = [];

        for (const item of items) {
            const k = this.key(item);
            wanted.add(k);
            let card = this.cards.get(k);
            if (!card) {
                card = { el: this.create(item), item };
                this.cards.set(k, card);
                entering.push(card.el);
            } else if (card.item !== item) {
                this.update(card.el, item, card.item);
                card.item = item;
            }
            ordered.push(card.el);
        }

        const departing = [];
        for (const [k, card] of this.cards) {
            if (!wanted.has(k)) { departing.push([k, card]); }
        }
        for (const [k, card] of departing) {
            this.cards.delete(k);
            this.leave(card.el, animate);
        }

        // Place cards in order. Leaving cards stay where they are until their animation ends.
        let cursor = this.container.firstElementChild;
        for (const el of ordered) {
            while (cursor && this.leaving.has(cursor)) cursor = cursor.nextElementSibling;
            if (cursor === el) { cursor = cursor.nextElementSibling; continue; }
            this.container.insertBefore(el, cursor);
        }

        if (animate) {
            this.flip(before, entering);
        }
    }

    measure() {
        const map = new Map();
        for (const [k, card] of this.cards) {
            if (!card.el.isConnected) continue;
            const r = card.el.getBoundingClientRect();
            map.set(k, { x: r.left, y: r.top });
        }
        return map;
    }

    flip(before, entering) {
        const fresh = new Set(entering);
        for (const [k, card] of this.cards) {
            const el = card.el;
            if (fresh.has(el)) {
                el.animate(
                    [{ opacity: 0, transform: 'translateY(14px) scale(.96)' }, { opacity: 1, transform: 'none' }],
                    { duration: 460, easing: EASE, fill: 'backwards' }
                );
                continue;
            }
            const from = before && before.get(k);
            if (!from) continue;
            const to = el.getBoundingClientRect();
            const dx = from.x - to.left, dy = from.y - to.top;
            if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
            el.animate(
                [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
                { duration: 480, easing: EASE }
            );
        }
    }

    leave(el, animate) {
        if (!animate || !el.isConnected) { el.remove(); return; }
        this.leaving.add(el);
        el.style.pointerEvents = 'none';
        const done = () => { this.leaving.delete(el); el.remove(); };
        const run = el.animate(
            [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.94)' }],
            { duration: 260, easing: 'ease-in', fill: 'forwards' }
        );
        run.onfinish = done;
        run.oncancel = done;
    }

    get size() { return this.cards.size; }
    values() { return [...this.cards.values()].map(card => card.el); }
    clear() {
        for (const card of this.cards.values()) card.el.remove();
        for (const el of this.leaving) el.remove();
        this.cards.clear();
        this.leaving.clear();
    }
}
