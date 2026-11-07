/**
 * The lobby: ties the server connection, the lobby mirror (`LobbyStore`), the three views (Rooms, Live and the
 * room you are sitting in) and the menu shell together. The game engine only talks to this class through a handful
 * of calls (`quickMatch`, `handleMessage`, `gameStarted`, …); everything about rooms stays in here.
 */
import { LobbyStore } from './lobby-store';
import { RoomsView } from './rooms-view';
import { LiveView } from './live-view';
import { RoomView } from './room-view';
import { Toast } from './toast';
import { ICONS } from './icons';
import { frameThrottle } from './dom';
import { getPlayerName } from './player-name';

const LOBBY_VIEWS = new Set(['create', 'rooms', 'live']);

export class LobbyHub {
    declare client: any;
    declare retryConnection: any; // NOTE: never assigned in the legacy code either (see docs/FINDINGS.md)
    declare shell: any;
    declare getServerUrl: () => string;
    declare openServerSettings: (...args: any[]) => any;
    declare store: any;
    declare toast: Toast;
    declare network: string;
    declare phase: string;
    declare pending: string;
    declare returnView: string;
    declare lastSetup: any;
    declare watching: boolean;
    declare pendingCode: string;
    declare tickTimer: number;
    declare roomsView: RoomsView;
    declare liveView: LiveView;
    declare roomView: RoomView;

    /**
     * @param {{client:import('../../net/multiplayer-client').MazeMultiplayerClient,
     *          shell:import('../create-game/create-game').CreateGameComponent,
     *          getServerUrl:()=>string, retryConnection:()=>void}} options
     */
    constructor({ client, shell, getServerUrl, retryConnection }) {
        this.client = client;
        this.shell = shell;
        this.getServerUrl = getServerUrl;
        this.openServerSettings = retryConnection;
        this.store = new LobbyStore();
        this.toast = new Toast(document.getElementById('lbToast'));
        this.network = 'offline';
        this.phase = 'idle';        // idle | joining | inRoom
        this.pending = '';          // quick | join | spectate | ''
        this.returnView = 'create';
        this.lastSetup = null;
        this.watching = false;
        this.pendingCode = '';
        this.tickTimer = 0;

        this.roomsView = new RoomsView(document.getElementById('lbRooms'), {
            store: this.store,
            onJoin: room => this.joinRoom(room),
            onJoinCode: code => this.joinCode(code),
            onCreate: () => this.shell.setView('create'),
            onRetry: () => this.retryConnection(),
            onNotice: message => this.toast.show(message, { tone: 'warn' })
        });
        this.liveView = new LiveView(document.getElementById('lbLive'), {
            store: this.store,
            onWatch: room => this.watchRoom(room),
            onPeek: ids => this.client.peek(ids),
            onBrowseRooms: () => this.shell.setView('rooms'),
            onRetry: () => this.retryConnection()
        });
        this.roomView = new RoomView(document.getElementById('lbRoom'), {
            onLeave: () => this.leaveRoom(),
            onStart: () => this.client.startRoom(),
            onCopy: code => this.copyInvite(code)
        });

        const refreshAll = frameThrottle(() => this.refreshAll());
        this.store.subscribe(() => refreshAll());
        shell.onViewChange = (view, previous) => this.viewChanged(view, previous);
        shell.onVisibility = visible => this.visibilityChanged(visible);
    }

    /* ── Connection state ── */
    get online() { return this.network === 'online'; }
    /** What the lists should show: offline, connecting, online, or old (a server without rooms). */
    get status() {
        if (this.network === 'online' && this.client.protocol && this.client.protocol < 2) return 'old';
        return this.network;
    }
    get supportsRooms() { return this.client.supportsRooms(); }

    onNetwork(state) {
        const was = this.network;
        this.network = state;
        if (state !== 'online') {
            this.watching = false;
            this.store.reset();
            this.liveView.forgetPeeks();
            if (was === 'online' || was === 'connecting') this.connectionLost(state);
        }
        this.pushStatus();
    }
    pushStatus() {
        const options = { hasUrl: Boolean(this.getServerUrl()) };
        this.roomsView.setStatus(this.status, options);
        this.liveView.setStatus(this.status, options);
        this.syncWatch();
    }
    connectionLost(state) {
        if (state === 'connecting') return;
        if (this.phase === 'joining' || this.phase === 'inRoom') {
            const joining = this.phase === 'joining';
            this.phase = 'idle';
            if (this.shell.view === 'room' && this.shell.visible) {
                this.roomView.showNotice({
                    title: joining ? 'Server unavailable' : 'Connection lost',
                    text: joining
                        ? 'Could not reach the game. Check your connection and try again.'
                        : 'The connection dropped, so you were removed from the room. Reconnecting happens automatically.',
                    actions: [
                        { label: 'Back to lobby', primary: true, icon: ICONS.back, onClick: () => this.backToLobby() },
                        { label: 'Reconnect', icon: ICONS.server, onClick: () => this.retryConnection() }
                    ]
                });
            }
        }
        this.roomsView.clearBusy();
        this.liveView.clearBusy();
    }

    /* ── Messages ── */
    /** Returns true when the message belonged to the lobby and needs no further handling. */
    handleMessage(message) {
        switch (message.type) {
            case 'connected':
                this.pushStatus(); // the protocol version is known now

                this.consumePendingCode();
                return false; // the engine also wants to know
            case 'lobby:state':
                this.store.applyState(message);
                return true;
            case 'lobby:patch':
                this.store.applyPatch(message);
                return true;
            case 'peek:maze':
            case 'peek:frame':
            case 'peek:end':
                this.liveView.onPeekMessage(message);
                return true;
            case 'room:joined':
                this.onJoined(message);
                return true;
            case 'room:state':
                if (this.phase === 'inRoom' || this.phase === 'joining') this.onJoined({ room: message.room, you: this.youId });
                return true;
            case 'room:notice':
                this.toast.show(message.message || 'The room changed.');
                return true;
            case 'room:error':
                return this.onRoomError(message);
            case 'room:closed':
                if (!this.shell.visible) return false; // a running game handles its own room
                if (this.phase !== 'idle') this.closedWhileWaiting(message);
                return true;
            case 'queue:waiting':
                // Protocol v2 servers send this only for old clients.
                if (this.supportsRooms || !this.shell.visible) return this.supportsRooms;
                if (this.phase === 'joining' || this.phase === 'inRoom') {
                    this.phase = 'inRoom';
                    this.shell.setView('room');
                    this.roomView.setLegacy(message.waitingPlayers, message.requiredPlayers || message.players);
                }
                return true;
            case 'room:forming':
                return this.supportsRooms;
            case 'queue:left':
                // v2 servers send this next to `room:left` for old clients; the engine must not treat it as "go to menu".
                return this.supportsRooms;
            case 'match:error':
            case 'protocol:error':
                // Rate limits and malformed requests end a pending join like any other refusal.
                return this.shell.visible ? this.onRoomError({ ...message, code: message.code || 'invalid' }) : false;
            default:
                return false;
        }
    }

    get youId() { return this.client.selfId; }

    onJoined(message) {
        this.phase = 'inRoom';
        this.pending = '';
        this.roomsView.clearBusy();
        this.roomView.setRoom(message.room, message.you || this.youId);
        if (this.shell.visible && this.shell.view !== 'room') this.shell.setView('room');
        this.roomView.setActive(this.shell.view === 'room');
    }

    onRoomError(message) {
        const code = message.code;
        if (code === 'stale') return true;
        const wasPending = this.pending;
        this.roomsView.clearBusy();
        this.liveView.clearBusy();
        if (this.phase === 'joining') {
            this.phase = 'idle';
            this.pending = '';
            this.shell.setView(this.returnView === 'room' ? 'create' : this.returnView);
        }
        if ((code === 'started' || code === 'full') && message.roomId && wasPending !== 'quick') {
            const room = this.store.get(message.roomId);
            if (room && room.phase === 'playing') {
                this.toast.show('That race has already started.', {
                    action: { label: 'Watch it', onClick: () => this.watchRoom(room) }, tone: 'warn', ms: 7000
                });
                return true;
            }
        }
        this.toast.show(message.message || 'That did not work.', { tone: 'warn' });
        return true;
    }

    closedWhileWaiting(message) {
        const was = this.phase;
        this.phase = 'idle';
        this.pending = '';
        this.toast.show(message.message || 'The room closed.', { tone: 'warn', ms: 6500 });
        if (this.shell.view === 'room') this.shell.setView(this.returnView === 'room' ? 'create' : this.returnView);
        return was;
    }

    /* ── Flows the player starts ── */
    /** The wizard's launch button: join a room with this exact set-up, or open one. */
    quickMatch(config) {
        const url = this.getServerUrl();
        this.rememberReturn();
        this.lastSetup = config;
        this.roomView.showJoining({
            size: config.size, players: config.players, goals: config.goals,
            title: config.separate ? 'Opening your room…' : 'Finding you a seat…',
            text: config.separate ? 'A new room with your setup, listed for everyone.' : 'Joining a room with this exact setup, or opening one.'
        });
        this.shell.setView('room');
        if (!url) {
            this.phase = 'idle';
            this.roomView.showNotice({
                actions: [
                    { label: 'Back', icon: ICONS.back, onClick: () => this.backToLobby() }
                ]
            });
            return;
        }
        this.phase = 'joining';
        this.pending = 'quick';
        this.client.connect(url);
        this.client.quickMatch(config, { separate: !!config.separate });
    }

    joinRoom(room) {
        if (!this.beginJoin(room, 'join')) return;
        this.client.joinRoom({ roomId: room.id, name: getPlayerName() });
    }
    joinCode(code) {
        if (this.phase !== 'idle') return;
        const known = this.store.findByCode(code);
        if (known && !this.beginJoin(known, 'join')) return;
        if (!known) {
            this.rememberReturn();
            this.phase = 'joining';
            this.pending = 'join';
            this.roomView.showJoining({ size: 33, players: 2, goals: 3, title: `Opening room ${code}…`, text: 'Taking a seat.' });
            this.shell.setView('room');
        }
        this.client.joinRoom({ code, name: getPlayerName() });
    }
    /** Shows the room we are about to sit in so the screen never flashes empty. */
    beginJoin(room, kind) {
        if (this.phase !== 'idle') return false;
        this.rememberReturn();
        this.phase = 'joining';
        this.pending = kind;
        // The bloom already shows the racers who are there, so the new seat opens among them.
        this.roomView.showJoining({
            size: room.size, players: room.capacity, goals: room.goals, seats: room.seats || [],
            title: `Joining ${room.host}'s room…`, text: `Taking a seat in room ${room.code}.`
        });
        this.shell.setView('room');
        return true;
    }
    watchRoom(room) {
        this.pending = 'spectate';
        this.client.spectate({ roomId: room.id });
    }
    leaveRoom() {
        this.client.leaveRoom();
        this.phase = 'idle';
        this.pending = '';
        this.backToLobby();
    }
    backToLobby() {
        this.phase = 'idle';
        this.shell.setView(this.returnView === 'room' ? 'create' : this.returnView);
    }
    rememberReturn() {
        if (this.shell.view !== 'room') this.returnView = this.shell.view;
    }
    copyInvite(code) {
        const link = /^https?:$/.test(location.protocol)
            ? `${location.origin}${location.pathname}?room=${encodeURIComponent(code)}`
            : code;
        const done = ok => this.roomView.flashCopied(ok);
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(() => done(true), () => done(false));
        else done(false);
    }

    /** Called from the page address (?room=K7QF): join as soon as the server answers. */
    joinWhenReady(code) {
        this.pendingCode = code;
        if (this.online && this.client.protocol) this.consumePendingCode();
    }
    consumePendingCode() {
        if (!this.pendingCode || !this.client.supportsRooms() || !this.shell.visible) return;
        const code = this.pendingCode;
        this.pendingCode = '';
        this.shell.setView('rooms');
        this.roomsView.setCode(code);
        this.joinCode(code);
    }

    /* ── Engine hooks ── */
    /** A race (or a spectated race) takes over the screen. */
    gameStarted() {
        this.phase = 'idle';
        this.pending = '';
        this.roomsView.clearBusy();
        this.liveView.clearBusy();
        this.syncWatch();
    }
    /** The menu is visible again after a game. */
    menuShown() {
        this.phase = 'idle';
        this.pending = '';
        this.syncWatch();
    }
    notice(message, options?: any) { this.toast.show(message, options); }

    /* ── View lifecycle ── */
    viewChanged(view, _previous?: any) {
        this.roomsView.setActive(view === 'rooms');
        this.liveView.setActive(view === 'live');
        this.roomView.setActive(view === 'room');
        this.syncWatch();
        this.syncTicker();
        if (view === 'rooms' || view === 'live') this.refreshAll();
    }
    visibilityChanged(visible) {
        if (!visible) {
            this.roomsView.setActive(false);
            this.liveView.setActive(false);
            this.roomView.setActive(false);
        } else {
            this.viewChanged(this.shell.view);
            this.consumePendingCode();
        }
        this.syncWatch();
        this.syncTicker();
    }
    /** The lobby feed is only needed while a lobby page is on screen. */
    syncWatch() {
        const wanted = this.online && this.shell.visible && LOBBY_VIEWS.has(this.shell.view);
        if (wanted && !this.watching) { this.client.watchLobby(); this.watching = true; }
        else if (!wanted && this.watching) { this.client.unwatchLobby(); this.watching = false; this.liveView.forgetPeeks(); }
        else if (!wanted) this.client.lobbyWanted = false;
    }
    syncTicker() {
        const want = this.shell.visible && (this.shell.view === 'rooms' || this.shell.view === 'live');
        if (want && !this.tickTimer) {
            this.tickTimer = setInterval(() => { this.roomsView.tick(); this.liveView.tick(); }, 1000);
        } else if (!want && this.tickTimer) {
            clearInterval(this.tickTimer);
            this.tickTimer = 0;
        }
    }

    refreshAll() {
        this.roomsView.refresh();
        this.liveView.refresh();
        const counts = this.store.counts;
        this.shell.setTabCount('rooms', this.store.ready ? counts.waitingRooms : 0);
        this.shell.setTabCount('live', this.store.ready ? counts.liveRooms : 0);
        this.shell.setOpenRooms(this.store.ready && this.supportsRooms ? this.store.waiting() : null, counts);
    }
}
