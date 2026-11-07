// Moved verbatim from legacy/mazeV3/server/server.js (statements 51, 75, 76, 77, 78, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112). Only imports/exports and `S.` state access were added.
import { LARGE_ROOM_FLUSH_MAX_MS, LARGE_ROOM_FLUSH_MIN_MS, MIN_PLAYERS, HARD_BUFFER_BYTES, BACKPRESSURE_BYTES, LARGE_ROOM_PLAYERS } from './config';
import WebSocket from 'ws';
import { clients, rooms } from './state';
// A snapshot grows with the room, so bigger rooms are flushed less often: ~100 ms at 25 racers, ~400 ms at 99.
export const flushIntervalMs = room => Math.min(LARGE_ROOM_FLUSH_MAX_MS, Math.max(LARGE_ROOM_FLUSH_MIN_MS, room.playerOrder.length * 4));

/* ── Sending ───────────────────────────────────────────────────────────── */
export function safeSend(socket, payload) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    try { socket.send(typeof payload === 'string' ? payload : JSON.stringify(payload)); return true; }
    catch (_) { return false; }
}
export function sendToPlayer(id, payload) {
    const peer = clients.get(id);
    return peer ? safeSend(peer.socket, payload) : false;
}
export function cleanName(value) {
    const name = String(value || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 24);
    return name || 'Player';
}
export function roomError(peer, code, message, extra?: any) {
    safeSend(peer.socket, { type: 'room:error', code, message, ...(extra || {}) });
}

/* ── Room messaging ────────────────────────────────────────────────────── */
export function roomMembers(room) {
    return room.playerOrder.map(id => {
        const p = room.playerStates.get(id);
        return { id: p.id, name: p.name, color: p.color, seat: p.seat, host: id === room.hostId };
    });
}
export function roomState(room) {
    return {
        id: room.id,
        code: room.code,
        phase: room.phase,
        size: room.size,
        goals: room.goalCount,
        capacity: room.capacity,
        hostId: room.hostId,
        createdAt: room.createdAt,
        minStart: MIN_PLAYERS,
        members: roomMembers(room)
    };
}
export function publicPlayers(room) {
    return room.playerOrder.map(id => {
        const p = room.playerStates.get(id);
        return {
            id: p.id,
            name: p.name,
            color: p.color,
            position: p.position,
            steps: p.steps,
            // Targets are collected strictly in order, so `goals` alone says which ones are done.
            goals: p.goals,
            finished: p.finished,
            connected: clients.has(id) && !p.left
        };
    });
}
export function sendRoom(room, payload) {
    const data = JSON.stringify(payload);
    for (const id of room.playerOrder) {
        const peer = clients.get(id);
        if (!peer) continue;
        if ((peer.socket.bufferedAmount || 0) > HARD_BUFFER_BYTES) {
            console.warn(`[ws] dropping stalled racer ${id}`);
            try { peer.socket.terminate(); } catch (_) { /* closing anyway */ }
            continue;
        }
        safeSend(peer.socket, data);
    }
}
export function sendSpectators(room, payload) {
    if (!room.spectators.size) return;
    const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
    for (const id of room.spectators) {
        const peer = clients.get(id);
        // Every spectator update is a full snapshot, so a slow viewer can safely skip some.
        if (peer && (peer.socket.bufferedAmount || 0) < BACKPRESSURE_BYTES) safeSend(peer.socket, data);
    }
}
export function broadcastRoomState(room) {
    sendRoom(room, { type: 'room:state', room: roomState(room) });
    // Protocol v1 clients only understand the queue counter.
    if (room.phase === 'waiting') {
        sendRoom(room, {
            type: 'queue:waiting',
            size: room.size,
            players: room.capacity,
            goals: room.goalCount,
            waitingPlayers: room.playerOrder.length,
            requiredPlayers: room.capacity
        });
    }
}
export function roomUpdatePayload(room, lastMove = null) {
    return {
        type: 'room:update',
        roomId: room.id,
        phase: room.phase,
        players: publicPlayers(room),
        spectators: room.spectators.size,
        lastMove
    };
}
export function updateRoom(room, lastMove: any = null) {
    if (room.flushTimer) { clearTimeout(room.flushTimer); room.flushTimer = null; }
    const payload = roomUpdatePayload(room, lastMove);
    sendRoom(room, payload);
    sendSpectators(room, payload);
}
export function scheduleSpectatorFlush(room) {
    if (!room.spectators.size || room.spectatorTimer) return;
    room.spectatorTimer = setTimeout(() => {
        room.spectatorTimer = null;
        if (rooms.has(room.id)) sendSpectators(room, roomUpdatePayload(room));
    }, Math.max(LARGE_ROOM_FLUSH_MIN_MS, flushIntervalMs(room)));
}
export function pushMoveUpdate(room, moverId, lastMove) {
    room.peekDirty = true;
    if (room.playerOrder.length <= LARGE_ROOM_PLAYERS) {
        sendRoom(room, roomUpdatePayload(room, lastMove));
    } else {
        sendToPlayer(moverId, roomUpdatePayload(room, lastMove));
        if (!room.flushTimer) {
            room.flushTimer = setTimeout(() => {
                room.flushTimer = null;
                if (rooms.has(room.id)) sendRoom(room, roomUpdatePayload(room));
            }, flushIntervalMs(room));
        }
    }
    scheduleSpectatorFlush(room);
}
