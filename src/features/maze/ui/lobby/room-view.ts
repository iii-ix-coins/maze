/**
 * The room you are sitting in while it waits for racers (or while the server finds you a seat). It lives inside the
 * same shell as the wizard: a big seat bloom on one side, the room's details on the other.
 *
 *   joining  – the request is on its way
 *   room     – seated; members listed live, host can start early
 *   notice   – something went wrong or the room closed; offers a way out
 */
import { h, plural, setText, initialOf } from './dom';
import { ICONS } from './icons';
import { CardList } from './card-list';
import { SeatBloom } from './seat-bloom';
import { Odometer } from '../create-game/controls';
import { levelOf, seatColor, seatsLeft } from './lobby-model';

export class RoomView {
    declare root: HTMLElement;
    declare onLeave: (...args: any[]) => any;
    declare onStart: (...args: any[]) => any;
    declare onCopy: (code: string) => void;
    declare mode: string;
    declare room: any;
    declare youId: string;
    declare active: boolean;
    declare canvas: any;
    declare bloom: SeatBloom;
    declare countOdo: any;
    declare odo: Odometer;
    declare ofText: any;
    declare eyebrow: any;
    declare title: any;
    declare text: any;
    declare codeText: any;
    declare copyLabel: any;
    declare copyButton: any;
    declare codeBox: any;
    declare facts: any;
    declare fill: any;
    declare meter: any;
    declare members: any;
    declare memberList: CardList;
    declare note: any;
    declare actions: any;
    declare leaveButton: any;
    declare startLabel: any;
    declare startButton: any;
    declare noticeActions: any;
    declare copyTimer: any;

    /**
     * @param {HTMLElement} root
     * @param {{onLeave:()=>void, onStart:()=>void, onCopy:(code:string)=>void}} hooks
     */
    constructor(root, { onLeave, onStart, onCopy }) {
        this.root = root;
        this.onLeave = onLeave;
        this.onStart = onStart;
        this.onCopy = onCopy;
        this.mode = 'joining';
        this.room = null;
        this.youId = '';
        this.active = false;

        this.canvas = h('canvas', { class: 'lb-bloom lb-bloom-xl', width: 360, height: 360, 'aria-hidden': 'true' });
        this.bloom = new SeatBloom(this.canvas, { pulse: true });
        this.countOdo = h('span', { class: 'lb-big-count' });
        this.odo = new Odometer(this.countOdo);
        this.ofText = h('small', { class: 'lb-big-of' });
        const stage = h('figure', { class: 'lb-room-stage' }, this.canvas,
            h('div', { class: 'lb-stage-center', 'aria-hidden': 'true' }, this.countOdo, this.ofText));

        this.eyebrow = h('p', { class: 'lb-eyebrow' });
        this.title = h('h2', { class: 'lb-room-title', tabindex: '-1' });
        this.text = h('p', { class: 'lb-room-text', 'aria-live': 'polite' });

        this.codeText = h('span', { class: 'lb-code-big' });
        this.copyLabel = h('span', null, 'Copy invite link');
        this.copyButton = h('button', { type: 'button', class: 'lb-copy', onclick: () => this.room && this.onCopy(this.room.code) },
            h('span', { html: ICONS.link }), this.copyLabel);
        this.codeBox = h('div', { class: 'lb-code-box' },
            h('div', null, h('small', null, 'Room code'), this.codeText), this.copyButton);

        this.facts = h('ul', { class: 'lb-chips-static' });
        this.fill = h('i', { class: 'lb-meter-fill' });
        this.meter = h('div', { class: 'lb-meter', 'aria-hidden': 'true' }, this.fill);

        this.members = h('ul', { class: 'lb-members', 'aria-label': 'Racers in this room' });
        this.memberList = new CardList(this.members, {
            key: member => member.id,
            create: member => this.createMember(member),
            update: (el, member) => this.updateMember(el, member)
        });

        this.note = h('p', { class: 'lb-room-note' });
        this.actions = h('div', { class: 'lb-actions' });
        this.leaveButton = h('button', { type: 'button', class: 'lb-btn', onclick: () => this.onLeave() },
            h('span', { html: ICONS.leave }), 'Leave room');
        this.startLabel = h('span', null, 'Start now');
        this.startButton = h('button', { type: 'button', class: 'lb-btn is-primary', onclick: () => this.onStart() },
            h('span', { html: ICONS.play }), this.startLabel);
        this.noticeActions = h('div', { class: 'lb-actions lb-notice-actions' });

        const panel = h('div', { class: 'lb-room-panel' },
            this.eyebrow, this.title, this.text,
            h('div', { class: 'lb-room-live' }, this.codeBox, this.facts, this.meter, this.members, this.note, this.actions),
            this.noticeActions);
        this.actions.append(this.leaveButton, this.startButton);
        root.append(h('div', { class: 'lb-room-screen' }, stage, panel));
        this.setMode('joining');
    }

    setActive(active) {
        this.active = active;
        this.bloom.setActive(active);
        if (active) this.bloom.resize();
    }

    setMode(mode) {
        this.mode = mode;
        this.root.dataset.mode = mode;
    }

    /** The request is on its way: show the room we hope to sit in. */
    showJoining({ size, players, goals, seats = [], title = 'Finding you a seat…', text = 'Looking for a room with this exact setup.' }) {
        this.room = null;
        this.youId = '';
        this.setMode('joining');
        setText(this.eyebrow, 'Online race');
        setText(this.title, title);
        setText(this.text, text);
        this.bloom.set(players, seats.map(seat => ({ seat, color: seatColor(seat) })));
        this.odo.set(seats.length);
        setText(this.ofText, `of ${players} seats`);
        this.showFacts({ size, goals, capacity: players });
        this.memberList.render([]);
        this.fill.style.transform = `scaleX(${Math.min(1, seats.length / Math.max(1, players)).toFixed(3)})`;
        this.root.dataset.you = 'false';
        this.focusTitle();
    }

    /** @param {object} state a `room:state` payload; @param {string} youId */
    setRoom(state, youId = this.youId) {
        this.room = state;
        this.youId = youId || this.youId;
        this.setMode('room');
        const members = state.members || [];
        const isHost = state.hostId === this.youId;
        const left = seatsLeft({ capacity: state.capacity, count: members.length });
        this.root.dataset.you = isHost ? 'host' : 'guest';
        this.root.dataset.phase = state.phase;
        setText(this.eyebrow, state.phase === 'preparing' ? 'Room full' : 'Waiting room');
        if (state.phase === 'preparing') {
            setText(this.title, 'Building your maze…');
            setText(this.text, 'Everybody is in. The race starts in a moment.');
        } else {
            setText(this.title, left === 1 ? 'One seat left' : 'Waiting for racers');
            setText(this.text, left === 1
                ? 'One more racer and the race starts.'
                : `${left} more ${plural(left, 'racer', 'racers')} needed. The race starts when all seats are taken.`);
        }
        setText(this.codeText, state.code);
        this.showFacts({ size: state.size, goals: state.goals, capacity: state.capacity });
        this.odo.set(members.length);
        setText(this.ofText, `of ${state.capacity} seats`);
        this.fill.style.transform = `scaleX(${Math.min(1, members.length / Math.max(1, state.capacity)).toFixed(3)})`;
        this.bloom.set(state.capacity, members.map(m => ({ seat: m.seat, color: m.color || seatColor(m.seat), you: m.id === this.youId })));
        this.memberList.render(members.map(m => ({ ...m, you: m.id === this.youId })));

        const waiting = state.phase === 'waiting';
        this.startButton.hidden = !isHost;
        this.startButton.disabled = !waiting || members.length < (state.minStart || 2);
        setText(this.startLabel, members.length < (state.minStart || 2)
            ? `Start now (needs ${state.minStart || 2} racers)`
            : `Start now with ${members.length}`);
        this.leaveButton.disabled = false;
        const hostName = (members.find(m => m.host) || {}).name || 'The host';
        setText(this.note, isHost
            ? 'You are the host. Start early whenever two or more racers are here.'
            : `${hostName} is the host and can start early; otherwise the race starts when the room is full.`);
        this.copyButton.hidden = false;
    }

    /** Protocol v1 servers only report "n of m". */
    setLegacy(waiting, required) {
        this.setMode('room');
        this.root.dataset.you = 'guest';
        this.root.dataset.phase = waiting >= required ? 'preparing' : 'waiting';
        this.root.dataset.legacy = 'true';
        const n = Math.max(0, Number(waiting) || 0);
        setText(this.title, n >= required ? 'Lobby full' : 'Waiting for racers');
        setText(this.text, n >= required ? 'Players found. Preparing a shared maze…' : `Waiting for ${required - n} more ${plural(required - n, 'racer', 'racers')} to join this exact setup.`);
        this.bloom.set(required, Array.from({ length: Math.min(n, required) }, (_, seat) => ({ seat, color: seatColor(seat) })));
        this.odo.set(n);
        setText(this.ofText, `of ${required} seats`);
        this.fill.style.transform = `scaleX(${Math.min(1, n / Math.max(1, required)).toFixed(3)})`;
        this.memberList.render([]);
        this.startButton.hidden = true;
        this.copyButton.hidden = true;
        setText(this.codeText, '—');
        setText(this.note, 'This server is older than the game. Update it to open rooms, share codes and watch races.');
    }

    /** An error, a closed room, a lost connection. `actions` = [{label, onClick, primary}]. */
    showNotice({ title, text, actions = [], eyebrow = 'Online race' }: any) {
        this.room = null;
        this.setMode('notice');
        this.root.dataset.phase = 'notice';
        setText(this.eyebrow, eyebrow);
        setText(this.title, title);
        setText(this.text, text);
        this.noticeActions.replaceChildren(...actions.map(action => h('button', {
            type: 'button', class: `lb-btn${action.primary ? ' is-primary' : ''}`, onclick: action.onClick
        }, action.icon && h('span', { html: action.icon }), action.label)));
        this.focusTitle();
    }

    showFacts({ size, goals, capacity }) {
        const level = levelOf(size);
        this.facts.replaceChildren(
            h('li', { class: 'lb-badge', dataset: { level: level.index } }, level.label),
            h('li', null, h('span', { class: 'lb-fact-ic', html: ICONS.grid }), `${size} × ${size}`),
            h('li', null, h('span', { class: 'lb-fact-ic', html: ICONS.target }), `${goals} ${plural(goals, 'target', 'targets')}`),
            h('li', null, h('span', { class: 'lb-fact-ic', html: ICONS.users }), `${capacity} seats`));
    }

    flashCopied(ok = true) {
        setText(this.copyLabel, ok ? 'Link copied' : 'Press Ctrl+C to copy');
        this.copyButton.classList.toggle('is-done', ok);
        clearTimeout(this.copyTimer);
        this.copyTimer = setTimeout(() => {
            setText(this.copyLabel, 'Copy invite link');
            this.copyButton.classList.remove('is-done');
        }, 2200);
    }

    focusTitle() {
        if (this.active) this.title.focus({ preventScroll: true });
    }

    createMember(member) {
        const refs: any = {};
        refs.dot = h('i', { class: 'lb-av' });
        refs.name = h('b', null);
        refs.badges = h('span', { class: 'lb-member-badges' });
        const el = h('li', { class: 'lb-member' }, refs.dot, refs.name, refs.badges);
        el._refs = refs;
        this.updateMember(el, member);
        return el;
    }
    updateMember(el, member) {
        const r = el._refs;
        r.dot.style.setProperty('--c', member.color || seatColor(member.seat));
        setText(r.dot, initialOf(member.name));
        setText(r.name, member.name);
        el.classList.toggle('is-you', !!member.you);
        const badges = [];
        if (member.host) badges.push(h('span', { class: 'lb-tag is-host' }, h('span', { html: ICONS.crown }), 'Host'));
        if (member.you) badges.push(h('span', { class: 'lb-tag is-you' }, 'You'));
        r.badges.replaceChildren(...badges);
    }
}
