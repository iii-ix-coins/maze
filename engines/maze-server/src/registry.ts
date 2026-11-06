// Moved verbatim from legacy/mazeV3/server/server.js (statements 79, 80, 81, 82, 83, 84, 85, 86, 87, 88). Only imports/exports and `S.` state access were added.
import { CODE_ALPHABET, RECENT_TTL_MS } from './config';
import { randomInt, randomUUID } from 'node:crypto';
import { roomsByCode, rooms, recentFinished, clients } from './state';

/* ── Rooms: lookup, lobby summaries ────────────────────────────────────── */
export function newRoomCode() {
    for (let length = 4; length <= 6; length++) {
        for (let attempt = 0; attempt < 60; attempt++) {
            let code = '';
            for (let i = 0; i < length; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
            if (!roomsByCode.has(code)) return code;
        }
    }
    return randomUUID().slice(0, 8).toUpperCase();
}
export function normalizeCode(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}
export function findRoom(message) {
    if (message && typeof message.roomId === 'string' && rooms.has(message.roomId)) return rooms.get(message.roomId);
    const code = normalizeCode(message && message.code);
    return code ? roomsByCode.get(code) || null : null;
}
export const listable = room => room.phase === 'waiting' || room.phase === 'preparing' || room.phase === 'playing';
export function listableRooms() {
    const out: any[] = [];
    for (const room of rooms.values()) if (listable(room)) out.push(room);
    return out;
}
export const activeCount = room => (room.phase === 'waiting' || room.phase === 'preparing')
    ? room.playerOrder.length
    : room.playerOrder.reduce((n, id) => n + (room.playerStates.get(id).left ? 0 : 1), 0);

export function leaderOf(room) {
    let best: any = null;
    for (const id of room.playerOrder) {
        const p = room.playerStates.get(id);
        if (p.left) continue;
        if (!best || p.goals > best.goals || (p.goals === best.goals && p.steps < best.steps)) best = p;
    }
    return best;
}
export function roomSummary(room) {
    const host = room.playerStates.get(room.hostId);
    const summary: any = {
        id: room.id,
        code: room.code,
        phase: room.phase,
        size: room.size,
        goals: room.goalCount,
        capacity: room.capacity,
        count: activeCount(room),
        host: host ? host.name : 'Player',
        createdAt: room.createdAt,
        spectators: room.spectators.size
    };
    if (room.phase === 'playing') {
        const leader = leaderOf(room);
        summary.startedAt = room.startedAt;
        summary.racers = room.playerOrder.length;
        summary.leader = leader ? { name: leader.name, color: leader.color, goals: leader.goals } : null;
    } else {
        summary.seats = room.playerOrder.map(id => room.playerStates.get(id).seat);
        summary.names = room.playerOrder.slice(0, 6).map(id => room.playerStates.get(id).name);
    }
    return summary;
}
export function recentList() {
    const cutoff = Date.now() - RECENT_TTL_MS;
    return recentFinished.filter(entry => entry.finishedAt >= cutoff);
}
export function currentCounts() {
    // Waiting seats per exact set-up ("size:players:goals"); the wizard sums them for its hints.
    const waitingByMode = {};
    let waitingPlayers = 0, waitingRooms = 0, liveRooms = 0, livePlayers = 0, spectators = 0;
    for (const room of rooms.values()) {
        spectators += room.spectators.size;
        if (room.phase === 'waiting') {
            const key = `${room.size}:${room.capacity}:${room.goalCount}`;
            waitingByMode[key] = (waitingByMode[key] || 0) + room.playerOrder.length;
            waitingPlayers += room.playerOrder.length;
            waitingRooms++;
        } else if (room.phase === 'preparing' || room.phase === 'playing') {
            liveRooms++;
            livePlayers += activeCount(room);
        }
    }
    return { waitingByMode, onlinePlayers: clients.size, waitingPlayers, waitingRooms, liveRooms, livePlayers, spectators, activeRooms: rooms.size };
}
