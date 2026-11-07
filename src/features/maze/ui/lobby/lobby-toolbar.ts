/**
 * Filter / sort / search / name controls shared by the Rooms and Live views.
 * Size chips double as a legend: each carries the tint its board size has everywhere else in the lobby.
 */
import { h } from './dom';
import { ICONS } from './icons';
import { DIFFICULTIES } from '@maze/shared';
import { bindNameInput } from './player-name';

const PREF_KEY = 'mazeLobbyPrefs';
export function loadPrefs() {
    try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch (_) { return {}; }
}
export function savePrefs(patch) {
    try { localStorage.setItem(PREF_KEY, JSON.stringify({ ...loadPrefs(), ...patch })); } catch (_) { /* ignore */ }
}

export class LobbyToolbar {
    declare onChange: (...args: any[]) => any;
    declare sizes: any;
    declare query: string;
    declare sort: any;
    declare chips: any;
    declare search: any;
    declare select: any;
    declare name: any;
    declare el: any;

    /**
     * @param {{sortOptions:[string,string][], sortKey:string, onChange:()=>void, searchLabel:string}} options
     */
    constructor({ sortOptions, sortKey, sortValue, onChange, searchLabel }) {
        this.onChange = onChange;
        this.sizes = new Set();
        this.query = '';
        this.sort = sortValue;

        this.chips = DIFFICULTIES.map((level, index) => h('button', {
            type: 'button',
            class: 'lb-chip',
            'aria-pressed': 'false',
            dataset: { level: index },
            onclick: () => this.toggleSize(level.size)
        }, h('i', { class: 'lb-chip-dot', 'aria-hidden': 'true' }), h('span', null, level.label), h('small', null)));

        this.search = h('input', {
            type: 'search', class: 'lb-input', placeholder: searchLabel, autocomplete: 'off', spellcheck: 'false',
            'aria-label': searchLabel,
            oninput: () => { this.query = this.search.value; this.onChange(); }
        });

        this.select = h('select', {
            class: 'lb-select', 'aria-label': 'Sort',
            onchange: () => { this.sort = this.select.value; savePrefs({ [sortKey]: this.sort }); this.onChange(); }
        }, sortOptions.map(([value, label]) => h('option', { value }, label)));
        this.select.value = this.sort;

        this.name = h('input', { type: 'text', class: 'lb-input lb-name-input', placeholder: 'Player', autocomplete: 'nickname', 'aria-label': 'Your name' });
        bindNameInput(this.name);

        this.el = h('div', { class: 'lb-toolbar' },
            h('div', { class: 'lb-chips', role: 'group', 'aria-label': 'Board size' }, this.chips),
            h('label', { class: 'lb-field lb-search' }, h('span', { class: 'lb-field-ic', html: ICONS.search }), this.search),
            h('label', { class: 'lb-field lb-sort' }, h('span', { class: 'lb-field-label' }, 'Sort'), this.select),
            h('label', { class: 'lb-field lb-name' }, h('span', { class: 'lb-field-label' }, 'You are'), this.name)
        );
    }

    toggleSize(size) {
        if (this.sizes.has(size)) this.sizes.delete(size); else this.sizes.add(size);
        this.chips.forEach((chip, i) => chip.setAttribute('aria-pressed', String(this.sizes.has(DIFFICULTIES[i].size))));
        this.onChange();
    }

    /** Shows how many rooms each size has, e.g. the "3" on the Medium chip. */
    setCounts(bySize) {
        this.chips.forEach((chip, i) => {
            const n = bySize[DIFFICULTIES[i].size] || 0;
            chip.querySelector('small').textContent = n ? String(n) : '';
            chip.classList.toggle('has-rooms', n > 0);
        });
    }

    get filter() { return { sizes: this.sizes, query: this.query }; }
    get isFiltering() { return this.sizes.size > 0 || this.query.trim() !== ''; }
    reset() {
        this.sizes.clear();
        this.query = '';
        this.search.value = '';
        this.chips.forEach(chip => chip.setAttribute('aria-pressed', 'false'));
        this.onChange();
    }
}
