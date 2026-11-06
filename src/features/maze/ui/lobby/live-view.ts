/**
 * The "Live" tab: every race in progress, each with a miniature of its maze and one dot per racer, moving as the
 * race moves. Only the thumbnails that are on screen are subscribed to (the server streams a few frames a second
 * for those and nothing for the rest). A shelf below lists races that just finished.
 */
import { h, plural, setText } from './dom';
import { ICONS } from './icons';
import { CardList } from './card-list';
import { LiveThumb } from './live-thumb';
import { LobbyToolbar, loadPrefs } from './lobby-toolbar';
import { levelOf, filterRooms, sortLive, liveProgress, formatClock, LIVE_SORT_MODES, sameRoom } from './lobby-model';

const MAX_VISIBLE_PEEKS = 12;
const MAZE_CACHE = 24;

function fact(icon, ref, key) {
    const text = h('span', null);
    ref[key] = text;
    return h('li', null, h('span', { class: 'lb-fact-ic', html: ICONS[icon] }), text);
}

export class LiveView {
    declare root: HTMLElement;
    declare store: any;
    declare onWatch: (room: object) => void;
    declare onPeek: (ids: string[]) => void;
    declare onBrowseRooms: (...args: any[]) => any;
    declare onRetry: (...args: any[]) => any;
    declare status: string;
    declare hasUrl: boolean;
    declare active: boolean;
    declare busyTimers: any;
    declare mazes: any;
    declare frames: any;
    declare visible: any;
    declare lastPeeked: string;
    declare toolbar: LobbyToolbar;
    declare sub: any;
    declare grid: any;
    declare list: CardList;
    declare empty: any;
    declare recent: any;
    declare observer: any;
    declare emptyKind: any;
    declare recentKey: any;
    declare peekTimer: any;

    /**
     * @param {HTMLElement} root
     * @param {{store:import('./lobby-store').LobbyStore, onWatch:(room:object)=>void, onPeek:(ids:string[])=>void,
     *          onBrowseRooms:()=>void, onRetry:()=>void}} hooks
     */
    constructor(root, { store, onWatch, onPeek, onBrowseRooms, onRetry }) {
        this.root = root;
        this.store = store;
        this.onWatch = onWatch;
        this.onPeek = onPeek;
        this.onBrowseRooms = onBrowseRooms;
        this.onRetry = onRetry;
        this.status = 'offline';
        this.hasUrl = false;
        this.active = false;
        this.busyTimers = new Map();
        this.mazes = new Map();    // roomId → last peek:maze
        this.frames = new Map();   // roomId → last peek:frame
        this.visible = new Set();
        this.lastPeeked = '';

        const prefs = loadPrefs();
        this.toolbar = new LobbyToolbar({
            sortOptions: [['close', 'Closest finish'], ['crowd', 'Most racers'], ['watched', 'Most watched'], ['newest', 'Newest first']],
            sortKey: 'liveSort',
            sortValue: LIVE_SORT_MODES.includes(prefs.liveSort) ? prefs.liveSort : 'close',
            searchLabel: 'Search racer or code',
            onChange: () => this.refresh()
        });
        this.sub = h('p', { class: 'lb-sub', 'aria-live': 'polite' });
        const head = h('header', { class: 'lb-head' },
            h('div', { class: 'lb-head-text' }, h('h2', { class: 'lb-title' }, 'Live races'), this.sub));

        this.grid = h('div', { class: 'lb-grid lb-grid-live', role: 'list', 'aria-label': 'Races in progress' });
        this.list = new CardList(this.grid, {
            create: room => this.createCard(room),
            update: (el, room, prev) => this.updateCard(el, room, prev)
        });
        this.empty = h('div', { class: 'lb-empty', hidden: true });
        this.recent = h('section', { class: 'lb-recent', hidden: true, 'aria-label': 'Recently finished races' });
        root.append(head, this.toolbar.el, this.grid, this.empty, this.recent);

        this.observer = 'IntersectionObserver' in window
            ? new IntersectionObserver(entries => this.onIntersect(entries), { rootMargin: '120px 0px' })
            : null;
        this.refresh();
    }

    setStatus(status, { hasUrl = this.hasUrl } = {}) {
        this.status = status;
        this.hasUrl = hasUrl;
        this.refresh();
    }

    setActive(active) {
        this.active = active;
        if (active) {
            this.tick();
            for (const el of this.list.values()) el._refs.thumb.resize();
            this.requestPeeks(true);
        } else {
            this.lastPeeked = '';
            this.onPeek([]);
        }
    }

    /* ── Rendering ── */
    refresh() {
        const all = this.store.live();
        const bySize = {};
        let racers = 0, watchers = 0;
        for (const room of all) {
            bySize[room.size] = (bySize[room.size] || 0) + 1;
            racers += room.count;
            watchers += room.spectators || 0;
        }
        this.toolbar.setCounts(bySize);
        const live = this.status === 'online' && this.store.ready;
        const filtered = live ? sortLive(filterRooms(all, this.toolbar.filter), this.toolbar.sort) : [];
        this.list.render(filtered);
        this.grid.hidden = !filtered.length;
        if (live) {
            setText(this.sub, all.length
                ? `${all.length} ${plural(all.length, 'race', 'races')} · ${racers} ${plural(racers, 'racer', 'racers')} running${watchers ? ` · ${watchers} watching` : ''}`
                : 'No race is running at the moment');
        } else {
            setText(this.sub, this.status === 'connecting' ? 'Connecting…' : 'Waiting for connection');
        }
        this.renderEmpty(all.length, filtered.length);
        this.renderRecent();
        this.requestPeeks();
    }

    renderEmpty(total, shown) {
        let kind = null;
        if (this.status === 'old') kind = 'old';
        else if (this.status !== 'online') kind = 'offline';
        else if (!this.store.ready) kind = 'loading';
        else if (!total) kind = 'none';
        else if (!shown) kind = 'filtered';
        this.empty.hidden = kind === null;
        if (kind === null) { this.emptyKind = null; return; }
        this.empty.dataset.kind = kind;
        const signature = `${kind}|${this.status}|${this.hasUrl}`;
        if (this.emptyKind === signature) return;
        this.emptyKind = signature;
        const button = (label, onClick, primary = true, icon = '') => h('button', {
            type: 'button', class: `lb-btn${primary ? ' is-primary' : ''}`, onclick: onClick
        }, icon && h('span', { html: icon }), label);
        if (kind === 'loading') {
            this.empty.replaceChildren(h('div', { class: 'lb-skeleton-row' },
                [0, 1].map(i => h('div', { class: 'lb-skeleton is-tall', style: `--i:${i}`, 'aria-hidden': 'true' }))));
        } else if (kind === 'offline' || kind === 'old') {
            this.empty.replaceChildren(
                h('span', { class: 'lb-empty-ic', html: ICONS.server }),
                h('h3', null, kind === 'old' ? 'Live races are not available yet' : this.status === 'connecting' ? 'Connecting…' : 'Not connected'),
                h('p', null, kind === 'old'
                    ? 'Watching live races is being updated. Please try again in a moment.'
                    : 'Live races appear as soon as the connection is back.'),
                button('Try again', () => this.onRetry(), true, ICONS.server));
        } else if (kind === 'filtered') {
            this.empty.replaceChildren(
                h('span', { class: 'lb-empty-ic', html: ICONS.search }),
                h('h3', null, 'No race matches those filters'),
                h('p', null, 'Try another board size or clear the search.'),
                button('Clear filters', () => this.toolbar.reset()));
        } else {
            this.empty.replaceChildren(
                h('div', { class: 'lb-radar', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('b')),
                h('h3', null, 'Quiet on the tracks'),
                h('p', null, 'When a room fills up, its race shows here live. You can watch it from the sidelines.'),
                button('Browse open rooms', () => this.onBrowseRooms(), true, ICONS.users));
        }
    }

    renderRecent() {
        const entries = this.status === 'online' && this.store.ready ? this.store.recentRaces() : [];
        this.recent.hidden = !entries.length;
        if (!entries.length) { this.recentKey = ''; return; }
        const key = entries.map(entry => entry.id).join();
        if (key === this.recentKey) return;
        this.recentKey = key;
        this.recent.replaceChildren(
            h('h3', { class: 'lb-recent-title' }, h('span', { html: ICONS.flag }), 'Just finished'),
            h('ul', { class: 'lb-recent-list' }, entries.map(entry => {
                const level = levelOf(entry.size);
                return h('li', { class: 'lb-recent-chip', dataset: { level: level.index } },
                    h('i', { class: 'lb-dot', style: `--c:${entry.winnerColor || '#8be0a4'}`, 'aria-hidden': 'true' }),
                    h('b', null, `${entry.winner} won`),
                    h('small', null, `${level.label} · ${entry.racers} ${plural(entry.racers, 'racer', 'racers')} · ${formatClock(entry.durationMs)}`));
            })));
    }

    /* ── Cards ── */
    createCard(room) {
        const refs: any = {};
        refs.canvas = h('canvas', { class: 'lb-thumb', width: 132, height: 132, 'aria-hidden': 'true' });
        refs.thumb = new LiveThumb(refs.canvas);
        refs.code = h('span', { class: 'lb-code-tag' });
        refs.level = h('span', { class: 'lb-badge' });
        refs.title = h('h3', { class: 'lb-card-title' });
        refs.leaderDot = h('i', { class: 'lb-dot', 'aria-hidden': 'true' });
        refs.leaderText = h('span', null);
        refs.fill = h('i', { class: 'lb-meter-fill' });
        refs.watchLabel = h('span', null, 'Watch live');
        refs.watch = h('button', { type: 'button', class: 'lb-join lb-watch', onclick: () => this.watch(el._room) },
            h('span', { class: 'lb-join-ic', html: ICONS.eye }), refs.watchLabel);
        const facts = h('ul', { class: 'lb-facts' },
            fact('clock', refs, 'clockText'), fact('eye', refs, 'watchersText'), fact('target', refs, 'goalsText'));
        const el = h('article', { class: 'lb-card lb-live', role: 'listitem', dataset: { id: room.id } },
            h('div', { class: 'lb-thumb-wrap is-loading' }, refs.canvas,
                h('span', { class: 'lb-live-badge' }, h('i'), 'LIVE')),
            h('div', { class: 'lb-live-info' },
                h('div', { class: 'lb-room-top' }, refs.code, refs.level),
                refs.title,
                h('div', { class: 'lb-leader' }, refs.leaderDot, refs.leaderText),
                h('div', { class: 'lb-meter', 'aria-hidden': 'true' }, refs.fill),
                facts,
                refs.watch));
        el._refs = refs;
        el._room = room;
        refs.wrap = el.querySelector('.lb-thumb-wrap');
        this.apply(el, room);
        const maze = this.mazes.get(room.id);
        if (maze) { refs.thumb.setMaze(maze); refs.wrap.classList.remove('is-loading'); }
        const frame = this.frames.get(room.id);
        if (frame) refs.thumb.setFrame(frame);
        if (this.observer) this.observer.observe(el);
        return el;
    }

    updateCard(el, room, prev) {
        el._room = room;
        if (prev && sameRoom(prev, room) && prev.startedAt === room.startedAt) return;
        this.apply(el, room);
    }

    apply(el, room) {
        const r = el._refs;
        const level = levelOf(room.size);
        el.dataset.level = String(level.index);
        el.setAttribute('aria-label', `Race ${room.code}, ${level.label}, ${room.count} racers`);
        setText(r.code, room.code);
        setText(r.level, level.label);
        setText(r.title, `${room.host}'s race`);
        setText(r.goalsText, `${room.goals} ${plural(room.goals, 'target', 'targets')}`);
        setText(r.watchersText, room.spectators ? `${room.spectators} watching` : 'no spectators yet');
        const leader = room.leader;
        if (leader && leader.goals > 0) {
            r.leaderDot.hidden = false;
            r.leaderDot.style.setProperty('--c', leader.color || '#8be0a4');
            setText(r.leaderText, `${leader.name} leads · ${leader.goals}/${room.goals}`);
        } else {
            r.leaderDot.style.setProperty('--c', 'transparent');
            r.leaderDot.hidden = true;
            setText(r.leaderText, `${room.count} ${plural(room.count, 'racer', 'racers')} just set off`);
        }
        r.fill.style.transform = `scaleX(${liveProgress(room).toFixed(3)})`;
        this.tickCard(el);
    }

    /* ── Watching ── */
    watch(room) {
        if (!room) return;
        this.setBusy(room.id, true);
        this.onWatch(room);
    }
    setBusy(roomId, on) {
        clearTimeout(this.busyTimers.get(roomId));
        this.busyTimers.delete(roomId);
        const card = this.list.cards.get(roomId);
        if (card) {
            card.el.classList.toggle('is-busy', on);
            setText(card.el._refs.watchLabel, on ? 'Opening…' : 'Watch live');
        }
        if (on) this.busyTimers.set(roomId, setTimeout(() => this.setBusy(roomId, false), 9000));
    }
    clearBusy() { for (const id of [...this.busyTimers.keys()]) this.setBusy(id, false); }

    /* ── Live peeks ── */
    onIntersect(entries) {
        for (const entry of entries) {
            const id = entry.target.dataset.id;
            if (!id) continue;
            if (entry.isIntersecting) this.visible.add(id); else this.visible.delete(id);
        }
        this.requestPeeks();
    }
    /** Asks the server for frames of the on-screen races (debounced; unchanged lists are not re-sent). */
    requestPeeks(force = false) {
        clearTimeout(this.peekTimer);
        this.peekTimer = setTimeout(() => {
            if (!this.active || this.status !== 'online') return;
            const ids = [];
            for (const el of this.list.values()) {
                const id = el.dataset.id;
                if (this.visible.has(id) || !this.observer) ids.push(id);
                if (ids.length >= MAX_VISIBLE_PEEKS) break;
            }
            const key = ids.join();
            if (!force && key === this.lastPeeked) return;
            this.lastPeeked = key;
            this.onPeek(ids);
        }, 140);
    }
    /** The server forgot our peeks (reconnect): ask again next time. */
    forgetPeeks() { this.lastPeeked = ''; }

    onPeekMessage(message) {
        const id = message.roomId;
        const card = this.list.cards.get(id);
        if (message.type === 'peek:maze') {
            this.mazes.set(id, message);
            if (this.mazes.size > MAZE_CACHE) this.mazes.delete(this.mazes.keys().next().value);
            if (card) { card.el._refs.thumb.setMaze(message); card.el._refs.wrap.classList.remove('is-loading'); }
            const frame = this.frames.get(id);
            if (card && frame) card.el._refs.thumb.setFrame(frame);
        } else if (message.type === 'peek:frame') {
            this.frames.set(id, message);
            if (this.frames.size > MAZE_CACHE) this.frames.delete(this.frames.keys().next().value);
            if (card) card.el._refs.thumb.setFrame(message);
        } else if (message.type === 'peek:end') {
            this.mazes.delete(id);
            this.frames.delete(id);
        }
    }

    tick() {
        for (const el of this.list.values()) this.tickCard(el);
    }
    tickCard(el) {
        const room = el._room;
        if (room && room.startedAt) setText(el._refs.clockText, formatClock(this.store.now() - room.startedAt));
    }
}
