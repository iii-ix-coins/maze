// Moved verbatim from legacy/mazeV3/server/server.js (statements 74, 139, 140, 141). Only imports/exports and `S.` state access were added.
import { wss, requestIp } from './http';
import { clients, connectionsByIp, lobbyWatchers, rooms, S } from './state';
import { setPeeks, markCounts, watchLobby, unwatchLobby } from './lobby';
import { leaveSpectating, spectateJoin } from './spectate';
import { dropMember, createRoomMessage, joinRoomMessage, quickMessage, startRoomMessage, leaveRoom } from './rooms';
import { RATE_BURST, RATE_PER_MS, PROTOCOL_VERSION, VALID_SIZES, MIN_PLAYERS, MAX_PLAYERS, MIN_GOALS, MAX_GOALS } from './config';
import { randomUUID } from 'node:crypto';
import { safeSend } from './messaging';
import { publishMaze, playerMove } from './race';

/* ── Connections ───────────────────────────────────────────────────────── */
export function handleDisconnect(peer) {
    if (!clients.has(peer.id)) return;
    clients.delete(peer.id);
    const ipCount = connectionsByIp.get(peer.ip) || 0;
    if (ipCount <= 1) connectionsByIp.delete(peer.ip);
    else connectionsByIp.set(peer.ip, ipCount - 1);
    lobbyWatchers.delete(peer);
    setPeeks(peer, []);
    leaveSpectating(peer);
    if (peer.roomId) {
        const room = rooms.get(peer.roomId);
        peer.roomId = null;
        if (room) dropMember(room, peer.id);
    }
    markCounts();
}
export function allowMessage(peer) {
    const now = Date.now();
    peer.tokens = Math.min(RATE_BURST, peer.tokens + (now - peer.tokenAt) * RATE_PER_MS);
    peer.tokenAt = now;
    if (peer.tokens < 1) return false;
    peer.tokens -= 1;
    return true;
}

export function initConnections() {
wss.on('error', error => console.error('[ws] server error:', error));

wss.on('connection', (socket, req) => {
    if (S.shuttingDown) { socket.close(1012, 'Server restarting'); return; }
    const ip = req.mazeClientIp || requestIp(req);
    connectionsByIp.set(ip, (connectionsByIp.get(ip) || 0) + 1);
    const id = randomUUID();
    const peer = {
        id,
        ip,
        number: S.nextPlayerNumber++,
        name: `Player ${S.nextPlayerNumber - 1}`,
        socket,
        roomId: null,
        spectatingId: null,
        peeks: new Set(),
        stale: false,
        alive: true,
        tokens: RATE_BURST,
        tokenAt: Date.now()
    };
    clients.set(id, peer);
    console.log(`[ws] connected player=${id}; online=${clients.size}`);
    safeSend(socket, {
        type: 'connected',
        playerId: id,
        playerName: peer.name,
        protocol: PROTOCOL_VERSION,
        limits: { sizes: [...VALID_SIZES], minPlayers: MIN_PLAYERS, maxPlayers: MAX_PLAYERS, minGoals: MIN_GOALS, maxGoals: MAX_GOALS },
        serverTime: Date.now()
    });
    markCounts();

    socket.on('pong', () => { peer.alive = true; });
    socket.on('message', raw => {
        if (!allowMessage(peer)) return;
        let message;
        try { message = JSON.parse(raw.toString()); }
        catch (_) { safeSend(socket, { type: 'protocol:error', message: 'Invalid JSON message.' }); return; }
        if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.type !== 'string') return;
        try {
            switch (message.type) {
                case 'lobby:watch': watchLobby(peer); break;
                case 'lobby:unwatch': unwatchLobby(peer); break;
                case 'lobby:peek': if (lobbyWatchers.has(peer)) setPeeks(peer, message.ids); break;
                case 'room:create': createRoomMessage(peer, message); break;
                case 'room:join': joinRoomMessage(peer, message); break;
                case 'room:quick':
                case 'queue:join': quickMessage(peer, message); break;
                case 'room:start': startRoomMessage(peer); break;
                case 'queue:leave':
                case 'room:leave': leaveRoom(peer); break;
                case 'spectate:join': spectateJoin(peer, message); break;
                case 'spectate:leave': leaveSpectating(peer, true); break;
                case 'maze:publish': publishMaze(peer, message); break;
                case 'player:move': playerMove(peer, message); break;
                default:
                    safeSend(socket, { type: 'protocol:error', message: 'Unknown message type.' });
            }
        } catch (error: any) {
            console.error(`[ws] message handler failed for peer=${peer.id}:`, error && error.stack || error);
            safeSend(socket, { type: 'protocol:error', message: 'The server could not process that message.' });
        }
    });
    socket.on('close', () => handleDisconnect(peer));
    socket.on('error', () => { /* The close handler owns lifecycle cleanup. */ });
});
}
