/**
 * "Create Your Game" — the pre-game flow.
 * Four steps (maze size → racers → targets → launch) that build one game set-up while a live
 * maze preview reacts to every choice. This component owns the DOM of the flow only; starting
 * the game is delegated to `onLaunch(config)`.
 */
import { DIFFICULTIES, MAX_GOALS, MAX_PLAYERS, MIN_GOALS, MIN_PLAYERS } from '@maze/shared';
import { MazeStage } from './maze-stage';
import { LensSlider, Dial, Ruler, HoldButton, Odometer } from './controls';
import { clamp, prefersReducedMotion } from './motion';
import { StepRail } from './step-rail';
import { bindNameInput } from '../lobby/player-name';

const STORAGE_KEY = 'mazeCreateGame';
const TAB_VIEWS = ['create', 'rooms', 'live'];
const EASE = 'cubic-bezier(.2, .8, .2, 1)';
const LAST_STEP = 3;
const SIZE_NOTES = [
    'Short corridors and only a few forks.',
    'A balanced twist of paths.',
    'Long routes with plenty of dead ends.'
];
const $ = id => document.getElementById(id);
const plural = (n, one, many) => (n === 1 ? one : many);

function playersNote(n) {
    if (n === 1) return 'Just you. Starts right away.';
    const label = n === 2 ? 'A head-to-head race.'
        : n <= 5 ? 'A small squad.'
        : n <= 12 ? 'A full pack.'
        : n <= 30 ? 'A crowd in the corridors.'
        : n <= 60 ? 'A swarm.'
        : 'A stampede.';
    return `${label} The race starts once all ${n} racers have joined.`;
}

function goalsNote(goals, size) {
    const per100 = goals / (size * size) * 100;
    if (per100 < 0.8) return 'Long walks between targets.';
    if (per100 < 3) return 'Targets spread across the whole maze.';
    if (per100 < 7) return 'Targets sit fairly close together.';
    return 'Crowded: targets are only a few steps apart.';
}

export class CreateGameComponent {
    declare root: any;
    declare onLaunch: any;
    declare step: number;
    declare maxStep: number;
    declare network: string;
    declare counts: any;
    declare stepEls: any;
    declare rail: StepRail;
    declare back: any;
    declare next: any;
    declare nameInput: any;
    declare launching: boolean;
    declare openRooms: any;
    declare view: string;
    declare homeView: string;
    declare viewToken: number;
    declare onViewChange: (...args: any[]) => any;
    declare onVisibility: (...args: any[]) => any;
    declare tabs: any;
    declare viewEls: any;
    declare state: { levelIndex: number; players: number; goals: number; separate: boolean; };
    declare shownOnce: boolean;
    declare stage: MazeStage;
    declare playersOdo: Odometer;
    declare goalsOdo: Odometer;
    declare lens: LensSlider;
    declare dial: Dial;
    declare ruler: Ruler;
    declare launchLabel: any;
    declare launchFill: any;
    declare hold: HoldButton;
    declare separateInput: any;
    declare holdPhase: any;

    constructor(root, { onLaunch }: any = {}) {
        this.root = root;
        this.onLaunch = onLaunch || (() => {});
        this.step = 0;
        this.maxStep = 0;
        this.network = 'offline';
        this.counts = {};
        this.stepEls = [...root.querySelectorAll('.cg-step')];
        // The four level tiles. Reaching a tile you have not visited yet is not allowed; going back is.
        this.rail = new StepRail($('cgRail'), {
            onSelect: target => { if (target <= this.maxStep) this.goTo(target); }
        });
        this.back = $('cgBack');
        this.next = $('cgNext');
        this.nameInput = $('playerName');
        this.launching = false;
        this.openRooms = null;       // waiting rooms from a v2 server; null = unknown (v1 servers only send counts)
        this.view = 'create';
        this.homeView = 'create';    // the tab to come back to after a game
        this.viewToken = 0;
        this.onViewChange = () => {};
        this.onVisibility = () => {};
        this.tabs = [...root.querySelectorAll('.cg-tab')];
        this.viewEls = { create: $('cgViewCreate'), rooms: $('lbRooms'), live: $('lbLive'), room: $('lbRoom') };

        const saved = this.loadState();
        this.state = { levelIndex: saved.levelIndex, players: saved.players, goals: saved.goals, separate: saved.separate };
        this.shownOnce = false;

        this.stage = new MazeStage($('cgStage'));
        this.playersOdo = new Odometer($('cgPlayersOdo'));
        this.goalsOdo = new Odometer($('cgGoalsOdo'));

        this.lens = new LensSlider($('cgLens'), {
            index: this.state.levelIndex,
            onFrame: t => this.stage.setLevel(t),
            onChange: index => { this.state.levelIndex = index; this.sync(); }
        });
        this.dial = new Dial($('cgDial'), {
            min: MIN_PLAYERS, max: MAX_PLAYERS, value: this.state.players,
            onChange: value => { this.state.players = value; this.sync(); }
        });
        this.ruler = new Ruler($('cgRuler'), {
            min: MIN_GOALS, max: MAX_GOALS, value: this.state.goals,
            onChange: value => { this.state.goals = value; this.sync(); }
        });
        this.lens.jumpTo(this.state.levelIndex);
        this.dial.jumpTo(this.state.players);
        this.ruler.jumpTo(this.state.goals);

        this.bindRepeat($('cgPlayersMinus'), () => this.dial.nudge(-1));
        this.bindRepeat($('cgPlayersPlus'), () => this.dial.nudge(1));

        const launchButton = $('cgLaunch');
        this.launchLabel = $('cgLaunchLabel');
        this.launchFill = launchButton.querySelector('.cg-launch-fill');
        this.hold = new HoldButton(launchButton, {
            duration: 900,
            onProgress: (p, phase) => this.onHoldProgress(p, phase),
            onComplete: () => this.launch()
        });

        root.querySelectorAll('.cg-summary button').forEach(button =>
            button.addEventListener('click', () => this.goTo(Number(button.dataset.step))));
        this.back.addEventListener('click', () => this.goTo(this.step - 1));
        this.next.addEventListener('click', () => this.goTo(this.step + 1));
        root.addEventListener('keydown', e => {
            if (e.key === 'Enter' && e.target.matches && e.target.matches('.cg-lens, .cg-dial, .cg-ruler')) {
                e.preventDefault();
                this.goTo(this.step + 1);
            }
        });

        bindNameInput(this.nameInput);

        this.separateInput = $('cgSeparate');
        this.separateInput.checked = this.state.separate;
        this.separateInput.addEventListener('change', () => { this.state.separate = this.separateInput.checked; this.sync(); });

        this.tabs.forEach((tab, i) => {
            tab.addEventListener('click', () => this.setView(tab.dataset.view));
            tab.addEventListener('keydown', e => {
                if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                e.preventDefault();
                const next = this.tabs[(i + (e.key === 'ArrowRight' ? 1 : this.tabs.length - 1)) % this.tabs.length];
                next.focus();
                this.setView(next.dataset.view);
            });
        });
        this.syncTabs();

        this.stage.shuffle();
        this.applyStep(0, { instant: true, focus: false });
        this.sync();
    }

    /* ── Persistence ── */
    loadState() {
        const fallback = { levelIndex: 1, players: 1, goals: 3, separate: false };
        try {
            const v = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (v) {
                const level = Math.round(Number(v.levelIndex));
                return {
                    levelIndex: Number.isFinite(level) ? clamp(level, 0, 2) : fallback.levelIndex,
                    players: clamp(Math.round(Number(v.players)) || fallback.players, MIN_PLAYERS, MAX_PLAYERS),
                    goals: clamp(Math.round(Number(v.goals)) || fallback.goals, MIN_GOALS, MAX_GOALS),
                    separate: v.separate === true
                };
            }
        } catch (_) { /* first visit or storage unavailable */ }
        return fallback;
    }
    saveState() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state)); } catch (_) { /* ignore */ }
    }

    /* ── Public API ── */
    get size() { return DIFFICULTIES[this.state.levelIndex].size; }
    getConfig() {
        return {
            size: this.size,
            players: this.state.players,
            goals: this.state.goals,
            name: this.nameInput.value.trim() || 'Player',
            separate: this.state.separate && this.state.players > 1
        };
    }
    get visible() { return this.root.classList.contains('show'); }
    show({ step = 0, view = null }: any = {}) {
        this.launching = false;
        this.root.classList.remove('is-launching');
        this.root.classList.add('show');
        document.body.classList.add('in-menu');
        this.hold.reset();
        this.stage.resetLaunch();
        if (this.shownOnce) this.stage.shuffle();
        this.shownOnce = true;
        this.maxStep = step;
        this.applyStep(step, { instant: true });
        this.setView(view || this.homeView, { instant: true });
        this.onVisibility(true);
    }
    hide() {
        const wasVisible = this.visible;
        this.root.classList.remove('show');
        this.stage.setActive(false);
        if (wasVisible) this.onVisibility(false);
    }
    setNetworkStatus(state, message) {
        this.network = state;
        this.sync();
    }
    updateLobbyCounts(counts) {
        this.counts = (counts && counts.waitingByMode) || {};
        this.sync();
    }
    /** Waiting rooms from a protocol v2 server; lets the wizard say how many rooms match the chosen set-up. */
    setOpenRooms(rooms) {
        this.openRooms = Array.isArray(rooms) ? rooms : null;
        this.sync();
    }
    setTabCount(name, count) {
        const badge = this.root.querySelector(`[data-count="${name}"]`);
        if (!badge) return;
        const n = Math.max(0, Number(count) || 0);
        if (Number(badge.textContent) === n && !badge.hidden === (n > 0)) return;
        const changed = badge.textContent !== String(n);
        badge.textContent = String(n);
        badge.hidden = n === 0;
        if (changed && n > 0) {
            badge.classList.remove('is-bump');
            void badge.offsetWidth;
            badge.classList.add('is-bump');
        }
    }

    /* ── Views: Create (the wizard), Rooms, Live and the room you sit in ── */
    syncTabs() {
        const index = TAB_VIEWS.indexOf(this.view);
        this.root.dataset.view = this.view;
        this.root.style.setProperty('--tab', String(Math.max(0, index)));
        this.tabs.forEach(tab => {
            const on = tab.dataset.view === this.view;
            tab.classList.toggle('is-active', on);
            tab.setAttribute('aria-selected', String(on));
            tab.tabIndex = on || (index < 0 && tab.dataset.view === this.homeView) ? 0 : -1;
        });
    }
    /** Cross-fades to another view. `room` is not a tab: it is where a joined room lives. */
    setView(name, { instant = false }: any = {}) {
        const next = this.viewEls[name];
        if (!next) return;
        const previous = this.view;
        const previousEl = this.viewEls[previous];
        if (name === previous && !next.hidden) {
            this.syncTabs();
            // Coming back to the menu on the same tab: the preview was switched off when the menu closed.
            if (name === 'create' && this.visible) {
                this.stage.setActive(true);
                this.stage.playReveal();
            }
            return;
        }
        this.view = name;
        if (TAB_VIEWS.includes(name)) this.homeView = name;
        this.syncTabs();
        const token = ++this.viewToken;
        const enter = () => {
            if (token !== this.viewToken) return;
            for (const [key, el] of Object.entries<any>(this.viewEls)) {
                el.getAnimations().forEach(animation => animation.cancel());
                el.hidden = key !== name;
            }
            if (name === 'create') {
                this.hold.reset();
                this.stage.resetLaunch();
                this.stage.setActive(this.visible);
                if (this.visible) this.stage.playReveal();
            } else {
                this.stage.setActive(false);
            }
            this.root.scrollTop = 0;
            if (!instant && !prefersReducedMotion() && this.visible) {
                next.animate([{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 440, easing: EASE });
            }
            this.onViewChange(name, previous);
        };
        if (instant || prefersReducedMotion() || !previousEl || previousEl.hidden || !this.visible) { enter(); return; }
        const fade = previousEl.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-8px)' }],
            { duration: 140, easing: 'ease-in', fill: 'forwards' });
        fade.onfinish = enter;
        fade.oncancel = enter;
    }

    /* ── Steps ── */
    goTo(step) {
        const target = clamp(step, 0, LAST_STEP);
        if (target === this.step || this.launching) return;
        this.maxStep = Math.max(this.maxStep, target);
        this.applyStep(target);
    }
    applyStep(step, { instant = false, focus = true }: any = {}) {
        const previous = this.step;
        this.step = step;
        this.maxStep = Math.max(this.maxStep, step);
        this.root.dataset.step = String(step);
        this.root.classList.toggle('is-instant', instant);
        this.stepEls.forEach((el, i) => {
            const active = i === step;
            el.classList.toggle('is-active', active);
            el.classList.toggle('is-before', i < step);
            el.classList.toggle('is-after', i > step);
            el.inert = !active;
            el.setAttribute('aria-hidden', String(!active));
        });
        this.rail.setStep(step, this.maxStep, { instant });
        this.back.disabled = step === 0;
        this.next.hidden = step === LAST_STEP;
        // The preview shows exactly what the current step is about.
        this.stage.setLayers({ racers: step === 1 || step === 3, targets: step >= 2 });
        this.sync();
        if (instant) requestAnimationFrame(() => this.root.classList.remove('is-instant'));
        if (focus && previous !== step) {
            const control = this.stepEls[step].querySelector('.cg-lens, .cg-dial, .cg-ruler, .cg-launch');
            if (control) control.focus({ preventScroll: true });
        }
    }

    /* ── Text, hints and stage state ── */
    waitingFor(withGoals) {
        const { levelIndex, players, goals } = this.state;
        const size = DIFFICULTIES[levelIndex].size;
        let total = 0;
        for (const [key, count] of Object.entries(this.counts)) {
            const [s, p, g] = key.split(':').map(Number);
            if (s === size && p === players && (!withGoals || g === goals)) total += Number(count) || 0;
        }
        return total;
    }
    /** Waiting rooms that match the chosen set-up (v2 servers). */
    roomsFor(withGoals) {
        const { levelIndex, players, goals } = this.state;
        const size = DIFFICULTIES[levelIndex].size;
        return (this.openRooms || []).filter(room => room.phase === 'waiting' && room.size === size && room.capacity === players &&
            room.count < room.capacity && (!withGoals || room.goals === goals));
    }
    lobbyLine(withGoals) {
        if (this.state.players < 2 || this.network !== 'online') return '';
        if (this.openRooms) {
            const rooms = this.roomsFor(withGoals);
            if (!rooms.length) return 'No open room with this setup yet. You would open one.';
            const racers = rooms.reduce((sum, room) => sum + room.count, 0);
            return `${rooms.length} open ${plural(rooms.length, 'room', 'rooms')} with this setup, ${racers} ${plural(racers, 'racer', 'racers')} waiting inside.`;
        }
        const n = this.waitingFor(withGoals);
        return n > 0
            ? `${n} ${plural(n, 'racer is', 'racers are')} already waiting for this setup.`
            : 'Nobody is waiting for this setup yet. You would be first.';
    }
    sync() {
        const { levelIndex, players, goals } = this.state;
        const level = DIFFICULTIES[levelIndex];
        const cells = level.size * level.size;

        // Step 1
        this.root.dataset.level = String(levelIndex);
        $('cgSizeName').textContent = level.label;
        $('cgSizeDetail').textContent = `${level.size} × ${level.size} maze, ${cells.toLocaleString('en-US')} cells`;
        $('cgSizeNote').textContent = SIZE_NOTES[levelIndex];
        this.lens.setAriaText(`${level.label}, ${level.size} by ${level.size}`);

        // Step 2
        this.playersOdo.set(players);
        $('cgPlayersUnit').textContent = plural(players, 'racer', 'racers');
        $('cgPlayersNote').textContent = playersNote(players);
        $('cgPlayersLobby').textContent = this.lobbyLine(false);
        this.dial.setAriaText(`${players} ${plural(players, 'racer', 'racers')}${players === 1 ? ', solo' : ''}`);
        this.stage.setRacers(players);

        // Step 3
        this.goalsOdo.set(goals);
        $('cgGoalsUnit').textContent = plural(goals, 'target', 'targets');
        $('cgGoalsNote').textContent = goalsNote(goals, level.size);
        $('cgGoalsLobby').textContent = this.lobbyLine(true);
        this.ruler.setAriaText(`${goals} ${plural(goals, 'target', 'targets')}`);
        this.stage.setTargets(goals);

        // Step 4
        const solo = players === 1;
        $('cgSumSize').textContent = `${level.label}, ${level.size} × ${level.size}`;
        $('cgSumPlayers').textContent = solo ? 'Solo' : `${players} racers, online`;
        $('cgSumGoals').textContent = String(goals);
        $('cgNameField').hidden = solo;
        $('cgSeparateField').hidden = solo || !this.openRooms;
        this.launchLabel.textContent = this.holdPhase === 'holding' ? 'Keep holding' : (solo ? 'Hold to start' : 'Hold to find a race');
        $('cgLaunchNote').textContent = solo
            ? 'Solo run. Starts right away.'
            : this.network === 'online'
                ? this.onlineLaunchNote(players)
                : 'Connecting to online racing… Solo play works right now.';

        // Progress rail
        const values = [level.label, solo ? 'Solo' : String(players), String(goals), ''];
        this.rail.setValues(values);
        this.saveState();
    }

    onlineLaunchNote(players) {
        const tail = `The race starts once all ${players} seats are taken.`;
        if (!this.openRooms) return `${this.lobbyLine(true)} ${tail}`.replace(/\s+/g, ' ').trim();
        const rooms = this.roomsFor(true);
        if (!rooms.length) return `No open room with this setup yet, so you open one. ${tail}`;
        const count = `${rooms.length} open ${plural(rooms.length, 'room matches', 'rooms match')}.`;
        return this.state.separate
            ? `${count} You will open a new room anyway. ${tail}`
            : `${count} You will take a seat in the fullest one. ${tail}`;
    }

    onHoldProgress(p, phase) {
        this.holdPhase = phase;
        this.rail.setCharging(phase === 'holding');
        this.launchFill.style.width = `${(p * 100).toFixed(1)}%`;
        this.root.style.setProperty('--charge', p.toFixed(3));
        const base = this.state.players === 1 ? 'Hold to start' : 'Hold to find a race';
        this.launchLabel.textContent = phase === 'holding' ? 'Keep holding' : phase === 'done' ? 'Launching' : base;
    }

    launch() {
        if (this.launching) return;
        this.launching = true;
        this.root.classList.add('is-launching');
        const config = this.getConfig();
        this.stage.playLaunch(() => {
            // An online launch keeps the menu on screen: it turns into the waiting room.
            if (this.onLaunch(config) === 'stay') {
                this.launching = false;
                this.root.classList.remove('is-launching');
                this.hold.reset();
                this.stage.resetLaunch();
            } else {
                this.hide();
            }
        });
    }

    /** Press-and-hold repeat for the nudge buttons next to the dial. */
    bindRepeat(button, action) {
        let timer = 0;
        const stop = () => { clearTimeout(timer); timer = 0; };
        button.addEventListener('pointerdown', e => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            e.preventDefault();
            action();
            let delay = 380;
            const tick = () => {
                action();
                delay = Math.max(50, delay * 0.82);
                timer = setTimeout(tick, delay);
            };
            timer = setTimeout(tick, delay);
        });
        for (const type of ['pointerup', 'pointercancel', 'pointerleave']) button.addEventListener(type, stop);
        // Keyboard and assistive-tech activation arrives as a click without a pointer.
        button.addEventListener('click', e => { if (e.detail === 0) action(); });
    }
}
