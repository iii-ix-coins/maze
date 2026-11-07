// Moved verbatim from legacy/mazeV3/server/server.js (statements 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102). Only imports/exports and `S.` state access were added.
import { S, dirtyRooms, removedRooms, rooms, lobbyWatchers, peekRooms, clients } from './state';
import { LOBBY_FLUSH_MS, PROTOCOL_VERSION, BACKPRESSURE_BYTES, MAX_PEEKS, PEEK_TICK_MS } from './config';
import { listableRooms, roomSummary, recentList, currentCounts, listable } from './registry';
import { safeSend } from './messaging';

/* ── Lobby fan-out: dirty tracking, one JSON string per flush ──────────── */
export function scheduleLobbyFlush() {
    if (!S.lobbyTimer) S.lobbyTimer = setTimeout(flushLobby, LOBBY_FLUSH_MS);
}
export function markDirty(room) {
    dirtyRooms.add(room.id);
    S.countsDirty = true;
    scheduleLobbyFlush();
}
export function markRemoved(id) {
    dirtyRooms.delete(id);
    removedRooms.add(id);
    S.countsDirty = true;
    scheduleLobbyFlush();
}
export function markCounts() {
    S.countsDirty = true;
    scheduleLobbyFlush();
}
// A burst of newcomers shares one serialised snapshot. Any change (or one second) retires it, so the
// `serverTime` that clients use to align their clocks is never stale.
export function lobbyStateJson() {
    const now = Date.now();
    if (!S.lobbyStateCache || now - S.lobbyStateCache.at > 1000) {
        S.lobbyStateCache = {
            at: now,
            json: JSON.stringify({
                type: 'lobby:state',
                protocol: PROTOCOL_VERSION,
                serverTime: now,
                rooms: listableRooms().map(roomSummary),
                recent: recentList(),
                counts: currentCounts()
            })
        };
    }
    return S.lobbyStateCache.json;
}
export function sendLobbyState(peer) {
    peer.stale = false;
    safeSend(peer.socket, lobbyStateJson());
}
export function flushLobby() {
    S.lobbyTimer = null;
    const upsert: any[] = [];
    const remove = [...removedRooms];
    for (const id of dirtyRooms) {
        const room = rooms.get(id);
        if (room && listable(room)) upsert.push(roomSummary(room));
        else remove.push(id);
    }
    const hadChanges = upsert.length || remove.length || S.recentDirty || S.countsDirty;
    const withRecent = S.recentDirty;
    dirtyRooms.clear();
    removedRooms.clear();
    S.recentDirty = false;
    S.countsDirty = false;
    if (!hadChanges) return;
    S.lobbyStateCache = null;
    if (!lobbyWatchers.size) return;
    const patch: any = { type: 'lobby:patch', serverTime: Date.now(), upsert, remove, counts: currentCounts() };
    if (withRecent) patch.recent = recentList();
    const data = JSON.stringify(patch);
    for (const peer of lobbyWatchers) {
        const buffered = peer.socket.bufferedAmount || 0;
        if (buffered > BACKPRESSURE_BYTES) { peer.stale = true; continue; } // resync once it drains
        if (peer.stale) sendLobbyState(peer);
        else safeSend(peer.socket, data);
    }
}
export function watchLobby(peer) {
    lobbyWatchers.add(peer);
    sendLobbyState(peer);
}
export function unwatchLobby(peer) {
    lobbyWatchers.delete(peer);
    setPeeks(peer, []);
}

/* ── Live peeks: thumbnails of running games for the lobby ─────────────── */
export function peekFrame(room) {
    return {
        type: 'peek:frame',
        roomId: room.id,
        t: Date.now(),
        pos: room.playerOrder.map(id => { const p = room.playerStates.get(id); return p.left ? -1 : p.position; }),
        goals: room.playerOrder.map(id => room.playerStates.get(id).goals)
    };
}
export function sendPeekMaze(peer, room) {
    safeSend(peer.socket, {
        type: 'peek:maze',
        roomId: room.id,
        code: room.code,
        size: room.size,
        goals: room.goalCount,
        startedAt: room.startedAt,
        maze: room.maze.maze,
        start: room.maze.start,
        exits: room.maze.exits,
        colors: room.playerOrder.map(id => room.playerStates.get(id).color)
    });
    safeSend(peer.socket, peekFrame(room));
}
export function setPeeks(peer, ids) {
    const next = new Set();
    // Unknown or not-yet-running ids must not eat into the budget of real ones.
    for (const id of Array.isArray(ids) ? ids.slice(0, MAX_PEEKS * 4) : []) {
        if (next.size >= MAX_PEEKS) break;
        const room = typeof id === 'string' ? rooms.get(id) : null;
        if (room && room.phase === 'playing') next.add(room.id);
    }
    for (const id of peer.peeks) {
        if (next.has(id)) continue;
        const room = rooms.get(id);
        if (!room) continue;
        room.peekers.delete(peer.id);
        if (!room.peekers.size) peekRooms.delete(room);
    }
    for (const id of next) {
        if (peer.peeks.has(id)) continue;
        const room = rooms.get(id);
        room.peekers.add(peer.id);
        peekRooms.add(room);
        sendPeekMaze(peer, room);
    }
    peer.peeks = next;
}
export function peekIntervalFor(room) {
    const n = room.peekers.size;
    return n > 100 ? 1000 : n > 30 ? 500 : PEEK_TICK_MS;
}
export function peekTick() {
    const now = Date.now();
    for (const room of peekRooms) {
        if (room.phase !== 'playing' || !room.peekDirty || now - room.lastPeekAt < peekIntervalFor(room) - 20) continue;
        room.peekDirty = false;
        room.lastPeekAt = now;
        const data = JSON.stringify(peekFrame(room));
        for (const id of room.peekers) {
            const peer = clients.get(id);
            if (peer && (peer.socket.bufferedAmount || 0) < BACKPRESSURE_BYTES) safeSend(peer.socket, data);
        }
    }
}
