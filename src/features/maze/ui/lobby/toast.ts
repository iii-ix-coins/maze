/**
 * A small status pill that slides up from the bottom of the menu: "That room is full", "Room closed", and so on.
 * It can carry one action button ("Watch instead").
 */
import { h } from './dom';

export class Toast {
    declare root: any;
    declare timer: number;
    declare current: any;

    constructor(root) {
        this.root = root;
        this.timer = 0;
        this.current = null;
    }
    show(message, { action = null, tone = 'info', ms = 5200 } = {}) {
        clearTimeout(this.timer);
        const pill = h('div', { class: `lb-toast-pill is-${tone}` },
            h('span', { class: 'lb-toast-text' }, message),
            action && h('button', {
                type: 'button',
                class: 'lb-toast-action',
                onclick: () => { this.hide(); action.onClick(); }
            }, action.label));
        this.root.replaceChildren(pill);
        this.current = pill;
        requestAnimationFrame(() => pill.classList.add('is-in'));
        this.timer = setTimeout(() => this.hide(), ms);
    }
    hide() {
        clearTimeout(this.timer);
        const pill = this.current;
        if (!pill) return;
        this.current = null;
        pill.classList.remove('is-in');
        setTimeout(() => { if (pill.parentNode === this.root) pill.remove(); }, 380);
    }
}
