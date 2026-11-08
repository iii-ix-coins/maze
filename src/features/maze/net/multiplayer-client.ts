/**
 * WebSocket transport for the lobby, rooms, spectating and synchronized race moves.
 * It deliberately contains no maze-generation or rendering logic.
 *
 * Protocol v2 servers speak in rooms (create / join / quick / start / spectate). A server that does not announce a
 * protocol version is an older deployment that only knows `queue:join`; `quickMatch()` transparently falls back to
 * it so a freshly deployed client still works against a server that has not been updated yet.
 */
const RECONNECT_MIN_MS = 1200;
const RECONNECT_MAX_MS = 20000;

export class MazeMultiplayerClient {
    declare onMessage: (...args: any[]) => any;
    declare onStatus: (...args: any[]) => any;
    declare url: string;
    declare socket: any;
    declare pendingAction: any;
    declare lobbyWanted: boolean;
    declare protocol: number;
    declare selfId: string;
    declare keepAlive: boolean;
    declare reconnectTimer: number;
    declare attempts: number;

    constructor({ onMessage = (..._args: any[]) => { }, onStatus = (..._args: any[]) => { } } = {}) {
        this.onMessage = onMessage;
        this.onStatus = onStatus;
        this.url = '';
        this.socket = null;
        /** Built lazily once the server has said which protocol it speaks: (protocol) => payload. */
        this.pendingAction = null;
        this.lobbyWanted = true;
        this.protocol = 0;
        this.selfId = '';
        this.keepAlive = false;
        this.reconnectTimer = 0;
        this.attempts = 0;
    }
    /** True once a v2 server has introduced itself. */
    supportsRooms() { return this.protocol >= 2; }
    connect(url) {
        const nextUrl = String(url || '').trim();
        if (!nextUrl) {
            this.onStatus('offline', 'Server URL needed');
            return false;
        }
        if (this.socket && this.url === nextUrl &&
            (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
            return true;
        }
        this.disconnect(false);
        this.url = nextUrl;
        this.keepAlive = true;
        this.attempts = 0;
        return this.open();
    }
    open() {
        window.clearTimeout(this.reconnectTimer);
        this.reconnectTimer = 0;
        this.protocol = 0;
        this.onStatus('connecting', this.attempts ? 'Reconnecting…' : 'Connecting…');
        let socket;
        try {
            socket = new WebSocket(this.url);
        } catch (error) {
            this.onStatus('offline', 'Invalid server URL');
            return false;
        }
        this.socket = socket;
        socket.addEventListener('open', () => {
            if (this.socket !== socket) return;
            this.attempts = 0;
            this.onStatus('online', 'Online lobby');
        });
        socket.addEventListener('message', event => {
            if (this.socket !== socket) return;
            let data;
            try { data = JSON.parse(event.data); }
            catch (_) { return; /* Ignore malformed messages from a disconnected/old server. */ }
            if (data && data.type === 'connected') this.handleConnected(data);
            // A bug in a handler must stay visible instead of silently dropping the message.
            try { this.onMessage(data); }
            catch (error) { console.error('Multiplayer message handler failed:', error); }
        });
        socket.addEventListener('error', () => {
            if (this.socket === socket) this.onStatus('offline', 'Server unavailable');
        });
        socket.addEventListener('close', () => {
            if (this.socket !== socket) return;
            this.socket = null;
            this.protocol = 0;
            this.onStatus('offline', this.keepAlive ? 'Offline · retrying…' : 'Offline · check server');
            this.scheduleReconnect();
        });
        return true;
    }
    /** The server's greeting tells us which protocol to speak; only then is queued work sent. */
    handleConnected(data) {
        this.protocol = Number(data.protocol) || 1;
        this.selfId = String(data.playerId || '');
        if (this.pendingAction) {
            const build = this.pendingAction;
            this.pendingAction = null;
            this.send(build(this.protocol));
        }
    }
    scheduleReconnect() {
        if (!this.keepAlive || !this.url || this.reconnectTimer) return;
        const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * Math.pow(1.7, this.attempts++));
        this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = 0;
            if (this.keepAlive && !this.socket) this.open();
        }, delay);
    }
    isOpen() { return !!this.socket && this.socket.readyState === WebSocket.OPEN; }
    send(payload) {
        if (!this.isOpen()) return false;
        this.socket.send(JSON.stringify(payload));
        return true;
    }
    /** Sends now when connected, otherwise connects first and sends as soon as the server has greeted us. */
    request(build) {
        if (this.isOpen() && this.protocol) return this.send(build(this.protocol));
        if (!this.url) {
            this.onStatus('offline', 'Server URL needed');
            return false;
        }
        this.pendingAction = build;
        if (!this.socket) this.open();
        return true;
    }

    /* ── Lobby ── */
    watchLobby() {
        this.lobbyWanted = true;
        return this.send({ type: 'lobby:watch' });
    }
    unwatchLobby() {
        this.lobbyWanted = false;
        return this.send({ type: 'lobby:unwatch' });
    }
    /** Live thumbnails for these running games (the server caps the list). */
    peek(ids) { return this.send({ type: 'lobby:peek', ids: [...ids] }); }

    /* ── Rooms ── */
    static setup({ size, players, goals, name }) {
        return {
            size: Number(size),
            players: Number(players),
            goals: Number(goals),
            name: String(name || 'Player').trim().slice(0, 24) || 'Player'
        };
    }
    /** Join a waiting room with exactly this set-up, or open one. `separate` always opens a new room. */
    quickMatch(config, { separate = false }: any = {}) {
        const setup = MazeMultiplayerClient.setup(config);
        return this.request(protocol => protocol >= 2
            ? { type: 'room:quick', ...setup, separate }
            : { type: 'queue:join', ...setup });
    }
    createRoom(config) {
        const setup = MazeMultiplayerClient.setup(config);
        return this.request(() => ({ type: 'room:create', ...setup }));
    }
    joinRoom({ roomId = '', code = '', name = 'Player' }) {
        const cleanName = String(name || 'Player').trim().slice(0, 24) || 'Player';
        return this.request(() => ({ type: 'room:join', roomId, code, name: cleanName }));
    }
    startRoom() { return this.send({ type: 'room:start' }); }
    /** Leaves the room, the waiting queue or the spectator seat. */
    leaveRoom() {
        this.pendingAction = null;
        return this.send({ type: 'room:leave' });
    }
    /** Legacy name kept for the protocol v1 queue. */
    leaveQueue() { return this.leaveRoom(); }
    publishMaze(maze) { return this.send({ type: 'maze:publish', maze }); }
    move(direction) { return this.send({ type: 'player:move', direction: Number(direction) }); }

    /* ── Spectating ── */
    spectate({ roomId = '', code = '' }) {
        return this.request(() => ({ type: 'spectate:join', roomId, code }));
    }
    leaveSpectate() { return this.send({ type: 'spectate:leave' }); }

    disconnect(notify = true) {
        this.keepAlive = false;
        window.clearTimeout(this.reconnectTimer);
        this.reconnectTimer = 0;
        this.pendingAction = null;
        this.protocol = 0;
        const current = this.socket;
        this.socket = null;
        if (current) {
            current.onclose = null;
            try { current.close(); } catch (_) { }
        }
        if (notify) this.onStatus('offline', 'Offline');
    }
}
