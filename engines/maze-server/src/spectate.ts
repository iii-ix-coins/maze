// Moved verbatim from legacy/mazeV3/server/server.js (statements 137, 138). Only imports/exports and `S.` state access were added.
import { releaseFinishedRoom } from './rooms';
import { rooms } from './state';
import { roomError, safeSend, publicPlayers } from './messaging';
import { findRoom } from './registry';
import { MAX_SPECTATORS_PER_ROOM } from './config';
import { setPeeks, markDirty } from './lobby';

/* ── Spectators ────────────────────────────────────────────────────────── */
export function spectateJoin(peer, message) {
    releaseFinishedRoom(peer);
    if (peer.roomId && rooms.has(peer.roomId)) { roomError(peer, 'busy', 'Leave your room before you watch another race.'); return; }
    const room = findRoom(message);
    if (!room) { roomError(peer, 'not-found', 'That game is no longer running.'); return; }
    if (room.phase !== 'playing') {
        roomError(peer, 'not-live', room.phase === 'finished' ? 'That race has just finished.' : 'That room has not started yet.', { roomId: room.id });
        return;
    }
    if (room.spectators.size >= MAX_SPECTATORS_PER_ROOM && !room.spectators.has(peer.id)) {
        roomError(peer, 'crowded', 'This race already has the maximum number of spectators.');
        return;
    }
    if (peer.spectatingId && peer.spectatingId !== room.id) leaveSpectating(peer);
    setPeeks(peer, []);
    room.spectators.add(peer.id);
    peer.spectatingId = room.id;
    safeSend(peer.socket, {
        type: 'spectate:start',
        roomId: room.id,
        code: room.code,
        phase: room.phase,
        maze: room.maze,
        size: room.size,
        goalCount: room.goalCount,
        startedAt: room.startedAt,
        spectators: room.spectators.size,
        players: publicPlayers(room)
    });
    markDirty(room);
}
export function leaveSpectating(peer, notify = false) {
    const roomId = peer.spectatingId;
    if (!roomId) return;
    peer.spectatingId = null;
    const room = rooms.get(roomId);
    if (room && room.spectators.delete(peer.id)) markDirty(room);
    if (notify) safeSend(peer.socket, { type: 'spectate:left', roomId });
}
