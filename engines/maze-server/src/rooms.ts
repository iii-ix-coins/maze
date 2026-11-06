// Moved verbatim from legacy/mazeV3/server/server.js (statements 54, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131). Only imports/exports and `S.` state access were added.
import { PALETTE, WAITING_ROOM_TTL_MS, MIN_PLAYERS, PREPARE_TIMEOUT_MS, MAX_PLAYERS, MIN_GOALS, MAX_GOALS, VALID_SIZES, MAX_ROOMS } from './config';
import { rooms, clients, peekRooms, roomsByCode } from './state';
import { safeSend, roomState, sendToPlayer, sendRoom, broadcastRoomState, updateRoom, roomError, cleanName } from './messaging';
import { markRemoved, setPeeks, markDirty } from './lobby';
import { randomUUID } from 'node:crypto';
import { newRoomCode, findRoom } from './registry';
import { leaveSpectating } from './spectate';
// Curated colours first, then evenly spread hues (golden angle) so 99 racers stay distinguishable.
// The colour belongs to the *seat*, so it stays put while other people come and go.
export function playerColor(index) {
    if (index < PALETTE.length) return PALETTE[index];
    return `hsl(${Math.round((index * 137.508) % 360)}, 72%, 64%)`;
}

/* ── Room lifecycle ────────────────────────────────────────────────────── */
export function clearRoomTimers(room) {
    for (const key of ['prepareTimer', 'cleanupTimer', 'flushTimer', 'spectatorTimer', 'expireTimer']) {
        if (room[key]) { clearTimeout(room[key]); room[key] = null; }
    }
}
/** Removes a room for good and tells everybody still attached to it why. */
export function closeRoom(room, reason, message) {
    if (!room || rooms.get(room.id) !== room) return;
    clearRoomTimers(room);
    const notice = { type: 'room:closed', roomId: room.id, reason, message: message || 'This room has closed.' };
    for (const id of room.playerOrder) {
        const peer = clients.get(id);
        if (!peer || peer.roomId !== room.id) continue;
        peer.roomId = null;
        // Racers who already know the result don't need a second notice.
        if (room.phase !== 'finished') safeSend(peer.socket, notice);
    }
    for (const id of room.spectators) {
        const peer = clients.get(id);
        if (!peer) continue;
        peer.spectatingId = null;
        safeSend(peer.socket, { type: 'spectate:ended', roomId: room.id, reason, message: notice.message });
    }
    for (const id of room.peekers) {
        const peer = clients.get(id);
        if (!peer) continue;
        peer.peeks.delete(room.id);
        safeSend(peer.socket, { type: 'peek:end', roomId: room.id, reason });
    }
    room.spectators.clear();
    room.peekers.clear();
    peekRooms.delete(room);
    rooms.delete(room.id);
    if (roomsByCode.get(room.code) === room) roomsByCode.delete(room.code);
    markRemoved(room.id);
    console.log(`[room] ${room.code} closed (${reason}); rooms=${rooms.size}`);
}
export function createRoom(peer, setup) {
    const room: any = {
        id: randomUUID(),
        code: newRoomCode(),
        size: setup.size,
        goalCount: setup.goals,
        capacity: setup.players,
        phase: 'waiting',
        hostId: peer.id,
        playerOrder: [],
        playerStates: new Map(),
        spectators: new Set(),
        peekers: new Set(),
        maze: null,
        winnerId: null,
        createdAt: Date.now(),
        startedAt: null,
        finishedAt: null,
        peekDirty: false,
        lastPeekAt: 0,
        joinCounter: 0,
        prepareTimer: null,
        cleanupTimer: null,
        flushTimer: null,
        spectatorTimer: null,
        expireTimer: null
    };
    room.expireTimer = setTimeout(() => {
        if (rooms.get(room.id) === room && room.phase === 'waiting') {
            closeRoom(room, 'expired', 'This room waited too long and was closed.');
        }
    }, WAITING_ROOM_TTL_MS);
    rooms.set(room.id, room);
    roomsByCode.set(room.code, room);
    console.log(`[room] ${room.code} opened; size=${room.size}; seats=${room.capacity}; goals=${room.goalCount}; rooms=${rooms.size}`);
    return room;
}
export function addMember(room, peer) {
    leaveSpectating(peer);
    setPeeks(peer, []);
    const used = new Set(room.playerOrder.map(id => room.playerStates.get(id).seat));
    let seat = 0;
    while (used.has(seat)) seat++;
    room.playerStates.set(peer.id, {
        id: peer.id,
        name: peer.name,
        color: playerColor(seat),
        seat,
        joinedAt: ++room.joinCounter,
        position: 0,
        steps: 0,
        goals: 0,
        finished: false,
        left: false
    });
    room.playerOrder.push(peer.id);
    room.playerOrder.sort((a, b) => room.playerStates.get(a).seat - room.playerStates.get(b).seat);
    peer.roomId = room.id;
}
export function oldestMember(room) {
    let best: any = null;
    for (const id of room.playerOrder) {
        const p = room.playerStates.get(id);
        if (!best || p.joinedAt < best.joinedAt) best = p;
    }
    return best ? best.id : null;
}
/** A member sits down: tell them, tell the others, start when the room is full. */
export function seatMember(room, peer) {
    addMember(room, peer);
    safeSend(peer.socket, { type: 'room:joined', room: roomState(room), you: peer.id });
    for (const id of room.playerOrder) {
        if (id !== peer.id) sendToPlayer(id, { type: 'room:state', room: roomState(room) });
    }
    sendRoom(room, {
        type: 'queue:waiting',
        size: room.size,
        players: room.capacity,
        goals: room.goalCount,
        waitingPlayers: room.playerOrder.length,
        requiredPlayers: room.capacity
    });
    markDirty(room);
    console.log(`[room] ${room.code} ${room.playerOrder.length}/${room.capacity}`);
    if (room.playerOrder.length >= room.capacity) startPreparing(room);
}
export function startPreparing(room) {
    if (room.phase !== 'waiting' || room.playerOrder.length < MIN_PLAYERS) return false;
    room.phase = 'preparing';
    if (room.expireTimer) { clearTimeout(room.expireTimer); room.expireTimer = null; }
    broadcastRoomState(room);
    sendRoom(room, { type: 'room:forming', roomId: room.id, size: room.size, players: room.capacity, goals: room.goalCount, waitingPlayers: room.playerOrder.length, requiredPlayers: room.capacity });
    requestMaze(room);
    markDirty(room);
    console.log(`[room] ${room.code} preparing; racers=${room.playerOrder.length}`);
    return true;
}
/** Asks the host to build the shared maze; a host that doesn't answer in time is replaced. */
export function requestMaze(room) {
    if (room.prepareTimer) clearTimeout(room.prepareTimer);
    sendToPlayer(room.hostId, { type: 'room:host', roomId: room.id, goals: room.goalCount, size: room.size });
    room.prepareTimer = setTimeout(() => {
        room.prepareTimer = null;
        if (rooms.get(room.id) !== room || room.phase !== 'preparing') return;
        const slowHost = room.hostId;
        console.warn(`[room] ${room.code} host did not publish a maze in time`);
        const peer = clients.get(slowHost);
        if (peer) {
            peer.roomId = null;
            safeSend(peer.socket, { type: 'room:closed', roomId: room.id, reason: 'host-timeout', message: 'The maze was not prepared in time, so you were removed from the room.' });
        }
        dropMember(room, slowHost);
    }, PREPARE_TIMEOUT_MS);
}
export function revertToWaiting(room, message) {
    if (room.prepareTimer) { clearTimeout(room.prepareTimer); room.prepareTimer = null; }
    room.phase = 'waiting';
    room.expireTimer = setTimeout(() => {
        if (rooms.get(room.id) === room && room.phase === 'waiting') closeRoom(room, 'expired', 'This room waited too long and was closed.');
    }, WAITING_ROOM_TTL_MS);
    broadcastRoomState(room);
    if (message) sendRoom(room, { type: 'room:notice', roomId: room.id, message });
    markDirty(room);
}
/** Removes one racer from a room, whatever its phase. */
export function dropMember(room, peerId) {
    const state = room.playerStates.get(peerId);
    if (!state || rooms.get(room.id) !== room) return;
    const phase = room.phase;
    if (phase === 'waiting' || phase === 'preparing') {
        room.playerStates.delete(peerId);
        room.playerOrder = room.playerOrder.filter(id => id !== peerId);
        if (!room.playerOrder.length) { closeRoom(room, 'empty', 'Everybody left this room.'); return; }
        const hostLeft = room.hostId === peerId;
        if (hostLeft) room.hostId = oldestMember(room);
        if (phase === 'preparing') {
            if (room.playerOrder.length < MIN_PLAYERS) {
                revertToWaiting(room, 'A racer left before the start, so the room is open again.');
                return;
            }
            // Enough racers remain: carry on, with a new maze-builder if the old one is gone.
            broadcastRoomState(room);
            if (hostLeft) requestMaze(room);
            markDirty(room);
            return;
        }
        broadcastRoomState(room);
        markDirty(room);
        return;
    }
    state.left = true;
    const stillRacing = room.playerOrder.some(id => !room.playerStates.get(id).left);
    if (stillRacing && phase === 'playing') {
        room.peekDirty = true;
        updateRoom(room);
        markDirty(room);
    } else if (!stillRacing) {
        closeRoom(room, 'abandoned', phase === 'playing' ? 'Every racer left this game.' : 'This room has closed.');
    }
}
export function leaveRoom(peer) {
    if (peer.spectatingId) { leaveSpectating(peer, true); return; }
    const room = rooms.get(peer.roomId);
    const roomId = peer.roomId;
    peer.roomId = null;
    if (room) dropMember(room, peer.id);
    safeSend(peer.socket, { type: 'room:left', roomId });
    safeSend(peer.socket, { type: 'queue:left' });
}

/* ── Joining ───────────────────────────────────────────────────────────── */
export function validSetup(message) {
    const players = Number(message.players);
    const goals = Number(message.goals);
    const size = Number(message.size);
    if (!Number.isInteger(players) || players < MIN_PLAYERS || players > MAX_PLAYERS ||
        !Number.isInteger(goals) || goals < MIN_GOALS || goals > MAX_GOALS ||
        !VALID_SIZES.has(size)) return null;
    return { size, players, goals };
}
export const SETUP_HELP = () => `Choose a ${[...VALID_SIZES].join(' / ')} maze, ${MIN_PLAYERS}–${MAX_PLAYERS} racers and ${MIN_GOALS}–${MAX_GOALS} targets.`;
/** A racer who has seen the result of a finished race is free to start something new without saying goodbye. */
export function releaseFinishedRoom(peer) {
    const current = peer.roomId ? rooms.get(peer.roomId) : null;
    if (current && current.phase === 'finished') {
        peer.roomId = null;
        dropMember(current, peer.id);
    }
}
export function guardIdle(peer) {
    releaseFinishedRoom(peer);
    if (peer.roomId && rooms.has(peer.roomId)) {
        roomError(peer, 'busy', 'You are already in a room. Leave it first.');
        return false;
    }
    peer.roomId = null;
    return true;
}
export function createRoomMessage(peer, message) {
    if (!guardIdle(peer)) return;
    const setup = validSetup(message);
    if (!setup) {
        console.warn(`[room] rejected invalid set-up from player=${peer.id}: size=${message.size}; players=${message.players}; goals=${message.goals}`);
        roomError(peer, 'invalid', SETUP_HELP());
        return;
    }
    if (rooms.size >= MAX_ROOMS) { roomError(peer, 'busy', 'The server is full of rooms right now. Try again in a moment.'); return; }
    peer.name = cleanName(message.name);
    seatMember(createRoom(peer, setup), peer);
}
export function joinRoomMessage(peer, message) {
    if (!guardIdle(peer)) return;
    const room = findRoom(message);
    if (!room) { roomError(peer, 'not-found', 'That room no longer exists.'); return; }
    if (room.phase === 'playing') {
        roomError(peer, 'started', 'That race has already started. You can watch it instead.', { roomId: room.id });
        return;
    }
    if (room.phase !== 'waiting') { roomError(peer, 'started', 'That room is starting right now.', { roomId: room.id }); return; }
    if (room.playerOrder.length >= room.capacity) { roomError(peer, 'full', 'That room is full.', { roomId: room.id }); return; }
    peer.name = cleanName(message.name);
    seatMember(room, peer);
}
/** Sits the player in the fullest waiting room with this exact set-up, or opens a new one. */
export function quickMessage(peer, message) {
    if (!guardIdle(peer)) return;
    const setup = validSetup(message);
    if (!setup) {
        console.warn(`[room] rejected invalid quick set-up from player=${peer.id}: size=${message.size}; players=${message.players}; goals=${message.goals}`);
        roomError(peer, 'invalid', SETUP_HELP());
        return;
    }
    peer.name = cleanName(message.name);
    let best: any = null;
    if (!message.separate) {
        for (const room of rooms.values()) {
            if (room.phase !== 'waiting' || room.size !== setup.size || room.capacity !== setup.players || room.goalCount !== setup.goals) continue;
            if (room.playerOrder.length >= room.capacity) continue;
            if (!best || room.playerOrder.length > best.playerOrder.length ||
                (room.playerOrder.length === best.playerOrder.length && room.createdAt < best.createdAt)) best = room;
        }
    }
    if (best) { seatMember(best, peer); return; }
    if (rooms.size >= MAX_ROOMS) { roomError(peer, 'busy', 'The server is full of rooms right now. Try again in a moment.'); return; }
    seatMember(createRoom(peer, setup), peer);
}
export function startRoomMessage(peer) {
    const room = rooms.get(peer.roomId);
    if (!room || room.phase !== 'waiting') { roomError(peer, 'not-waiting', 'There is no waiting room to start.'); return; }
    if (room.hostId !== peer.id) { roomError(peer, 'not-host', 'Only the host can start the race.'); return; }
    if (room.playerOrder.length < MIN_PLAYERS) {
        roomError(peer, 'need-players', `At least ${MIN_PLAYERS} racers are needed to start.`);
        return;
    }
    startPreparing(room);
}
