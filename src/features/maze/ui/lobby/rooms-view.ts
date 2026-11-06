/**
 * The "Rooms" tab: every room that is still waiting for racers, drawn as a ticket with a live seat bloom.
 * Cards arrive, update and leave with FLIP animation as `lobby:patch` messages come in.
 */
import { h, plural, setText, initialOf } from './dom';
import { ICONS } from './icons';
import { CardList } from './card-list';
import { SeatBloom } from './seat-bloom';
import { LobbyToolbar, loadPrefs } from './lobby-toolbar';
import { Odometer } from '../create-game/controls';
import {
    levelOf, filterRooms, sortWaiting, seatsLeft, fillRatio, roomHeat, formatAge, seatColor, sameRoom, cleanCode,
    WAITING_SORT_MODES
} from './lobby-model';

const BUSY_MS = 9000;

function fact(icon, ref, key) {
    const text = h('span', null);
    ref[key] = text;
    return h('li', null, h('span', { class: 'lb-fact-ic', html: ICONS[icon] }), text);
}

export class RoomsView {
    declare root: HTMLElement;
    declare store: any;
    declare onJoin: (room: object) => void;
    declare onJoinCode: (code: string) => void;
    declare onCreate: (...args: any[]) => any;
    declare onRetry: (...args: any[]) => any;
    declare onNotice: (msg: string) => void;
    declare status: string;
    declare hasUrl: boolean;
    declare active: boolean;
    declare busyTimers: any;
    declare toolbar: LobbyToolbar;
    declare sub: any;
    declare codeInput: any;
    declare codeForm: any;
    declare grid: any;
    declare list: CardList;
    declare empty: any;
    declare emptyCanvas: any;
    declare emptyBloom: SeatBloom;
    declare emptyKind_: any;

    /**
     * @param {HTMLElement} root
     * @param {{store:import('./lobby-store').LobbyStore, onJoin:(room:object)=>void, onJoinCode:(code:string)=>void,
     *          onCreate:()=>void, onRetry:()=>void, onNotice:(msg:string)=>void}} hooks
     */
    constructor(root, { store, onJoin, onJoinCode, onCreate, onRetry, onNotice }) {
        this.root = root;
        this.store = store;
        this.onJoin = onJoin;
        this.onJoinCode = onJoinCode;
        this.onCreate = onCreate;
        this.onRetry = onRetry;
        this.onNotice = onNotice;
        this.status = 'offline';   // offline | connecting | online | old
        this.hasUrl = false;
        this.active = false;
        this.busyTimers = new Map();

        const prefs = loadPrefs();
        this.toolbar = new LobbyToolbar({
            sortOptions: [['fill', 'Nearly full first'], ['newest', 'Newest first'], ['biggest', 'Biggest rooms']],
            sortKey: 'roomsSort',
            sortValue: WAITING_SORT_MODES.includes(prefs.roomsSort) ? prefs.roomsSort : 'fill',
            searchLabel: 'Search host or code',
            onChange: () => this.refresh()
        });

        this.sub = h('p', { class: 'lb-sub', 'aria-live': 'polite' });
        this.codeInput = h('input', {
            type: 'text', class: 'lb-code-input', maxlength: '6', placeholder: '····', autocomplete: 'off',
            autocapitalize: 'characters', spellcheck: 'false', 'aria-label': 'Room code',
            oninput: () => { const clean = cleanCode(this.codeInput.value); if (this.codeInput.value !== clean) this.codeInput.value = clean; }
        });
        this.codeForm = h('form', { class: 'lb-code', onsubmit: event => { event.preventDefault(); this.submitCode(); } },
            h('label', { class: 'lb-code-label' }, 'Have a code?'),
            h('div', { class: 'lb-code-row' }, this.codeInput,
                h('button', { type: 'submit', class: 'lb-code-go', 'aria-label': 'Join room by code', html: ICONS.arrow })));

        const head = h('header', { class: 'lb-head' },
            h('div', { class: 'lb-head-text' }, h('h2', { class: 'lb-title' }, 'Open rooms'), this.sub),
            this.codeForm);

        this.grid = h('div', { class: 'lb-grid', role: 'list', 'aria-label': 'Open rooms' });
        this.list = new CardList(this.grid, {
            create: room => this.createCard(room),
            update: (el, room, prev) => this.updateCard(el, room, prev)
        });
        this.empty = h('div', { class: 'lb-empty', hidden: true });
        this.emptyCanvas = h('canvas', { class: 'lb-bloom lb-bloom-lg', width: 132, height: 132, 'aria-hidden': 'true' });
        this.emptyBloom = new SeatBloom(this.emptyCanvas, { pulse: true });
        this.emptyBloom.set(6, []);
        root.append(head, this.toolbar.el, this.grid, this.empty);
        this.refresh();
    }

    /* ── Connection state, set by the hub ── */
    setStatus(status, { hasUrl = this.hasUrl } = {}) {
        this.status = status;
        this.hasUrl = hasUrl;
        this.refresh();
    }
    setActive(active) {
        this.active = active;
        this.emptyBloom.setActive(active);
        for (const el of this.list.values()) el._refs.bloom.setActive(active);
        if (active) { this.tick(); for (const el of this.list.values()) el._refs.bloom.resize(); }
    }

    /* ── Rendering ── */
    refresh() {
        const all = this.store.waiting();
        const bySize = {};
        let racers = 0;
        for (const room of all) {
            bySize[room.size] = (bySize[room.size] || 0) + 1;
            if (room.phase === 'waiting') racers += room.count;
        }
        this.toolbar.setCounts(bySize);
        const live = this.status === 'online' && this.store.ready;
        const filtered = live ? sortWaiting(filterRooms(all, this.toolbar.filter), this.toolbar.sort) : [];
        this.list.render(filtered);
        this.grid.hidden = !filtered.length;

        if (live) {
            setText(this.sub, all.length
                ? `${all.length} ${plural(all.length, 'room', 'rooms')} · ${racers} ${plural(racers, 'racer', 'racers')} waiting`
                : 'Nobody is waiting for a game right now');
        } else {
            setText(this.sub, this.status === 'connecting' ? 'Connecting…' : 'Waiting for connection');
        }
        this.renderEmpty(all.length, filtered.length);
    }

    renderEmpty(total, shown) {
        const wanted = this.emptyKind(total, shown);
        this.empty.hidden = wanted === null;
        if (wanted === null) { this.emptyKind_ = null; return; }
        this.empty.dataset.kind = wanted;
        // The offline wording depends on the connection state and on whether an address is set.
        const signature = `${wanted}|${this.status}|${this.hasUrl}`;
        if (this.emptyKind_ === signature) return;
        this.emptyKind_ = signature;
        const button = (label, onClick, primary = false, icon = '') => h('button', {
            type: 'button', class: `lb-btn${primary ? ' is-primary' : ''}`, onclick: onClick
        }, icon && h('span', { html: icon }), label);
        let body;
        switch (wanted) {
            case 'loading':
                body = [0, 1, 2].map(i => h('div', { class: 'lb-skeleton', style: `--i:${i}`, 'aria-hidden': 'true' }));
                this.empty.replaceChildren(h('div', { class: 'lb-skeleton-row' }, body));
                return;
            case 'offline':
                this.empty.replaceChildren(
                    h('span', { class: 'lb-empty-ic', html: ICONS.server }),
                    h('h3', null, this.status === 'connecting' ? 'Connecting…' : 'Not connected'),
                    h('p', null, 'Open rooms appear as soon as the connection is back. Solo play keeps working meanwhile.'),
                    button('Try again', () => this.onRetry(), true, ICONS.server));
                return;
            case 'old':
                this.empty.replaceChildren(
                    h('span', { class: 'lb-empty-ic', html: ICONS.server }),
                    h('h3', null, 'Rooms are not available yet'),
                    h('p', null, 'The room list is being updated. Quick matches from Create still work meanwhile.'),
                    button('Try again', () => this.onRetry(), true, ICONS.server));
                return;
            case 'filtered':
                this.empty.replaceChildren(
                    h('span', { class: 'lb-empty-ic', html: ICONS.search }),
                    h('h3', null, 'No room matches those filters'),
                    h('p', null, 'Try another board size or clear the search.'),
                    button('Clear filters', () => this.toolbar.reset(), true));
                return;
            default:
                this.empty.replaceChildren(
                    this.emptyCanvas,
                    h('h3', null, 'No open rooms right now'),
                    h('p', null, 'Open one yourself. It shows up here instantly, and anyone can take a seat.'),
                    button('Create a room', () => this.onCreate(), true, ICONS.plus));
                this.emptyBloom.resize();
        }
    }

    emptyKind(total, shown) {
        if (this.status === 'old') return 'old';
        if (this.status !== 'online') return 'offline';
        if (!this.store.ready) return 'loading';
        if (!total) return 'none';
        if (!shown) return 'filtered';
        return null;
    }

    /* ── Cards ── */
    createCard(room) {
        const refs: any = {};
        refs.canvas = h('canvas', { class: 'lb-bloom', width: 92, height: 92, 'aria-hidden': 'true' });
        refs.bloom = new SeatBloom(refs.canvas);
        refs.bloom.setActive(this.active);
        refs.code = h('span', { class: 'lb-code-tag' });
        refs.level = h('span', { class: 'lb-badge' });
        refs.title = h('h3', { class: 'lb-card-title' });
        refs.countOdo = h('span', { class: 'lb-count' });
        refs.odo = new Odometer(refs.countOdo);
        refs.capacity = h('span', { class: 'lb-count-of' });
        refs.left = h('span', { class: 'lb-left' });
        refs.fill = h('i', { class: 'lb-meter-fill' });
        refs.avatars = h('div', { class: 'lb-avatars', 'aria-hidden': 'true' });
        refs.joinLabel = h('span', null, 'Join');
        refs.join = h('button', { type: 'button', class: 'lb-join', onclick: () => this.join(el._room) },
            refs.joinLabel, h('span', { class: 'lb-join-ic', html: ICONS.arrow }));
        const facts = h('ul', { class: 'lb-facts' },
            fact('grid', refs, 'sizeText'), fact('target', refs, 'goalsText'), fact('clock', refs, 'ageText'));
        const el = h('article', { class: 'lb-card lb-room', role: 'listitem' },
            h('div', { class: 'lb-room-main' },
                h('div', { class: 'lb-bloom-wrap' }, refs.canvas),
                h('div', { class: 'lb-room-info' },
                    h('div', { class: 'lb-room-top' }, refs.code, refs.level),
                    refs.title,
                    facts)),
            h('div', { class: 'lb-room-meter' },
                h('div', { class: 'lb-meter', 'aria-hidden': 'true' }, refs.fill),
                h('div', { class: 'lb-meter-text' },
                    h('span', { class: 'lb-seats' }, refs.countOdo, refs.capacity), refs.left)),
            h('div', { class: 'lb-perf', 'aria-hidden': 'true' }),
            h('footer', { class: 'lb-room-foot' }, refs.avatars, refs.join));
        el._refs = refs;
        el._room = room;
        this.apply(el, room, null);
        return el;
    }

    updateCard(el, room, prev) {
        el._room = room;
        if (prev && sameRoom(prev, room)) return;
        this.apply(el, room, prev);
    }

    apply(el, room, prev) {
        const r = el._refs;
        const level = levelOf(room.size);
        const left = seatsLeft(room);
        const starting = room.phase !== 'waiting';
        el.dataset.level = String(level.index);
        el.dataset.heat = starting ? 'starting' : roomHeat(room);
        el.dataset.phase = room.phase;
        el.setAttribute('aria-label', `${room.host}'s room, code ${room.code}, ${level.label}, ${room.count} of ${room.capacity} racers`);
        setText(r.code, room.code);
        setText(r.level, level.label);
        setText(r.title, `${room.host}'s room`);
        setText(r.sizeText, `${room.size} × ${room.size}`);
        setText(r.goalsText, `${room.goals} ${plural(room.goals, 'target', 'targets')}`);
        setText(r.capacity, ` / ${room.capacity}`);
        r.odo.set(room.count);
        setText(r.left, starting ? 'Starting…' : left === 1 ? 'Last seat open' : `${left} seats left`);
        r.fill.style.transform = `scaleX(${fillRatio(room).toFixed(3)})`;
        const seats = Array.isArray(room.seats) ? room.seats : [];
        r.bloom.set(room.capacity, seats.map(seat => ({ seat, color: seatColor(seat) })));
        this.renderAvatars(r.avatars, room);
        r.join.disabled = starting || left <= 0;
        r.join.setAttribute('aria-label', starting ? `${room.host}'s room is starting` : `Join ${room.host}'s room`);
        setText(r.joinLabel, starting ? 'Starting' : el.classList.contains('is-busy') ? 'Joining…' : 'Join');
        this.tickCard(el);
        if (prev && room.count > prev.count) this.bump(el);
    }

    renderAvatars(container, room) {
        const names = room.names || [];
        const seats = room.seats || [];
        const items = names.slice(0, 5).map((name, i) => h('span', {
            class: 'lb-av', title: name, style: `--c:${seatColor(seats[i])}`
        }, initialOf(name)));
        const extra = room.count - items.length;
        if (extra > 0) items.push(h('span', { class: 'lb-av lb-av-more' }, `+${extra}`));
        container.replaceChildren(...items);
    }

    bump(el) {
        el.classList.remove('is-bump');
        void el.offsetWidth;
        el.classList.add('is-bump');
        setTimeout(() => el.classList.remove('is-bump'), 900);
    }

    /* ── Actions ── */
    join(room) {
        if (!room || room.phase !== 'waiting') return;
        this.setBusy(room.id, true);
        this.onJoin(room);
    }
    setBusy(roomId, on) {
        clearTimeout(this.busyTimers.get(roomId));
        this.busyTimers.delete(roomId);
        const card = this.list.cards.get(roomId);
        if (card) {
            card.el.classList.toggle('is-busy', on);
            setText(card.el._refs.joinLabel, on ? 'Joining…' : 'Join');
        }
        if (on) this.busyTimers.set(roomId, setTimeout(() => this.setBusy(roomId, false), BUSY_MS));
    }
    clearBusy() { for (const id of [...this.busyTimers.keys()]) this.setBusy(id, false); }

    submitCode() {
        const code = cleanCode(this.codeInput.value);
        if (code.length < 4) {
            this.codeForm.classList.remove('is-shaking');
            void this.codeForm.offsetWidth;
            this.codeForm.classList.add('is-shaking');
            this.onNotice('Room codes have 4 characters, like K7QF.');
            return;
        }
        this.onJoinCode(code);
    }
    setCode(code) { this.codeInput.value = cleanCode(code); }

    /** Once a second: "waiting 1:12" clocks. */
    tick() {
        for (const el of this.list.values()) this.tickCard(el);
    }
    tickCard(el) {
        const room = el._room;
        if (!room) return;
        const age = this.store.now() - room.createdAt;
        setText(el._refs.ageText, room.phase === 'waiting' ? `waiting ${formatAge(age)}` : 'starting');
    }
}
