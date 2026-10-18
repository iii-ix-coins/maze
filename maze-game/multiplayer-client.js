/**
 * WebSocket transport for lobby counts, matchmaking and synchronized race moves.
 * It deliberately contains no maze-generation or rendering logic.
 */
export class MazeMultiplayerClient {
    constructor({ onMessage = () => {}, onStatus = () => {} } = {}) {
        this.onMessage = onMessage;
        this.onStatus = onStatus;
        this.url = '';
        this.socket = null;
        this.pendingJoin = null;
        this.hasWatchedLobby = false;
    }
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
        this.hasWatchedLobby = false;
        this.onStatus('connecting', 'Connecting…');
        let socket;
        try {
            socket = new WebSocket(nextUrl);
        } catch (error) {
            this.onStatus('offline', 'Invalid server URL');
            return false;
        }
        this.socket = socket;
        socket.addEventListener('open', () => {
            if (this.socket !== socket) return;
            this.onStatus('online', 'Online lobby');
            this.send({ type: 'lobby:watch' });
            this.hasWatchedLobby = true;
            if (this.pendingJoin) {
                const pending = this.pendingJoin;
                this.pendingJoin = null;
                this.send(pending);
            }
        });
        socket.addEventListener('message', event => {
            if (this.socket !== socket) return;
            try { this.onMessage(JSON.parse(event.data)); }
            catch (_) { /* Ignore malformed messages from a disconnected/old server. */ }
        });
        socket.addEventListener('error', () => {
            if (this.socket === socket) this.onStatus('offline', 'Server unavailable');
        });
        socket.addEventListener('close', () => {
            if (this.socket !== socket) return;
            this.socket = null;
            this.hasWatchedLobby = false;
            this.onStatus('offline', 'Offline · check server');
        });
        return true;
    }
    isOpen() { return !!this.socket && this.socket.readyState === WebSocket.OPEN; }
    send(payload) {
        if (!this.isOpen()) return false;
        this.socket.send(JSON.stringify(payload));
        return true;
    }
    joinQueue(players, goals, name) {
        const payload = {
            type: 'queue:join',
            players: Number(players),
            goals: Number(goals),
            name: String(name || 'Player').trim().slice(0, 24) || 'Player'
        };
        if (this.isOpen()) return this.send(payload);
        if (this.url) {
            this.pendingJoin = payload;
            this.connect(this.url);
            return true;
        }
        this.onStatus('offline', 'Server URL needed');
        return false;
    }
    leaveQueue() {
        this.pendingJoin = null;
        return this.send({ type: 'queue:leave' });
    }
    leaveRoom() { return this.send({ type: 'room:leave' }); }
    publishMaze(maze) { return this.send({ type: 'maze:publish', maze }); }
    move(direction) { return this.send({ type: 'player:move', direction: Number(direction) }); }
    disconnect(notify = true) {
        const current = this.socket;
        this.socket = null;
        this.hasWatchedLobby = false;
        if (current) {
            current.onclose = null;
            try { current.close(); } catch (_) {}
        }
        if (notify) this.onStatus('offline', 'Offline');
    }
}
