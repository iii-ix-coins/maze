// Moved verbatim from legacy/mazeV3/server/server.js (statements 132, 133, 134, 135, 136). Only imports/exports and `S.` state access were added.
import { rooms, recentFinished, S, clients, peekRooms } from './state';
import { roomError, publicPlayers, sendToPlayer, updateRoom, safeSend, pushMoveUpdate, sendRoom, sendSpectators } from './messaging';
import { closeRoom } from './rooms';
import { markDirty } from './lobby';
import { RECENT_MAX, ROOM_RETENTION_MS } from './config';

/* ── The race ──────────────────────────────────────────────────────────── */
export function validMazePayload(maze, goalCount, size) {
    const cells = size * size;
    if (!maze || typeof maze.maze !== 'string' || maze.maze.length !== cells) return false;
    if (!/^[0-9a-f]+$/i.test(maze.maze)) return false;
    if (!Number.isInteger(maze.start) || maze.start < 0 || maze.start >= cells) return false;
    if (!Array.isArray(maze.exits) || maze.exits.length !== goalCount) return false;
    const seen = new Set([maze.start]);
    for (const exit of maze.exits) {
        if (!Number.isInteger(exit) || exit < 0 || exit >= cells || seen.has(exit)) return false;
        seen.add(exit);
    }
    return true;
}
export function publishMaze(peer, message) {
    const room = rooms.get(peer.roomId);
    if (!room || room.phase !== 'preparing' || room.hostId !== peer.id) {
        // Usually a late answer from a host that was replaced meanwhile.
        roomError(peer, 'stale', 'The maze was not needed any more.');
        return;
    }
    if (!validMazePayload(message.maze, room.goalCount, room.size)) {
        console.error(`[room] ${room.code} rejected host maze payload; expected cells=${room.size * room.size}, goals=${room.goalCount}`);
        closeRoom(room, 'bad-maze', 'The generated maze data was invalid. Please open a new room.');
        return;
    }
    const raw = message.maze;
    room.maze = {
        maze: raw.maze.toLowerCase(),
        start: raw.start,
        exits: raw.exits.slice(),
        goalCount: room.goalCount,
        size: room.size
    };
    room.phase = 'playing';
    room.startedAt = Date.now();
    if (room.prepareTimer) { clearTimeout(room.prepareTimer); room.prepareTimer = null; }
    console.log(`[room] ${room.code} started; size=${room.size}; racers=${room.playerOrder.length}; goals=${room.goalCount}`);
    for (const id of room.playerOrder) {
        const state = room.playerStates.get(id);
        state.position = room.maze.start;
        state.steps = 0;
        state.goals = 0;
        state.finished = false;
        state.left = false;
    }
    const players = publicPlayers(room);
    for (const id of room.playerOrder) {
        sendToPlayer(id, {
            type: 'game:start',
            roomId: room.id,
            code: room.code,
            maze: room.maze,
            players,
            ownPlayerId: id,
            goalCount: room.goalCount,
            startedAt: room.startedAt
        });
    }
    updateRoom(room);
    room.peekDirty = true;
    markDirty(room);
}
export function nextCell(cell, direction, size) {
    const row = Math.floor(cell / size);
    const col = cell % size;
    if (direction === 0 && row > 0) return cell - size;
    if (direction === 1 && col < size - 1) return cell + 1;
    if (direction === 2 && row < size - 1) return cell + size;
    if (direction === 3 && col > 0) return cell - 1;
    return -1;
}
export function playerMove(peer, message) {
    const room = rooms.get(peer.roomId);
    if (!room || room.phase !== 'playing' || room.winnerId) return;
    const state = room.playerStates.get(peer.id);
    const direction = Number(message.direction);
    if (!state || state.left || !Number.isInteger(direction) || direction < 0 || direction > 3) return;
    const currentMask = parseInt(room.maze.maze[state.position], 16);
    const target = nextCell(state.position, direction, room.size);
    if (target < 0 || !(currentMask & (1 << direction))) {
        safeSend(peer.socket, { type: 'player:blocked', direction });
        return;
    }
    const from = state.position;
    state.position = target;
    state.steps++;
    let collectedGoal = null;
    const expectedGoal = room.maze.exits[state.goals];
    if (expectedGoal === target) {
        collectedGoal = state.goals + 1;
        state.goals++;
    }
    let winner = false;
    if (state.goals >= room.goalCount) {
        state.finished = true;
        room.winnerId = state.id;
        room.phase = 'finished';
        room.finishedAt = Date.now();
        winner = true;
    }
    const lastMove = { id: state.id, direction, from, to: target, collectedGoal };
    // The deciding move always reaches everybody at once.
    if (winner) {
        room.peekDirty = true;
        updateRoom(room, lastMove);
        finishRace(room, state);
        return;
    }
    pushMoveUpdate(room, state.id, lastMove);
    // The lobby only cares about the lead, so it is refreshed when a target is collected.
    if (collectedGoal) markDirty(room);
}
export function finishRace(room, winnerState) {
    const finish = {
        type: 'game:finish',
        roomId: room.id,
        winnerId: winnerState.id,
        winnerName: winnerState.name,
        players: publicPlayers(room)
    };
    sendRoom(room, finish);
    sendSpectators(room, finish);
    const entry = {
        id: room.id,
        code: room.code,
        size: room.size,
        goals: room.goalCount,
        winner: winnerState.name,
        winnerColor: winnerState.color,
        racers: room.playerOrder.length,
        durationMs: room.finishedAt - room.startedAt,
        finishedAt: room.finishedAt
    };
    recentFinished.unshift(entry);
    recentFinished.length = Math.min(recentFinished.length, RECENT_MAX);
    S.recentDirty = true;
    for (const id of room.peekers) {
        const peer = clients.get(id);
        if (!peer) continue;
        peer.peeks.delete(room.id);
        safeSend(peer.socket, { type: 'peek:end', roomId: room.id, reason: 'finished', winner: winnerState.name });
    }
    room.peekers.clear();
    peekRooms.delete(room);
    if (room.flushTimer) { clearTimeout(room.flushTimer); room.flushTimer = null; }
    if (room.spectatorTimer) { clearTimeout(room.spectatorTimer); room.spectatorTimer = null; }
    markDirty(room); // not listable any more → removed from the live shelf
    console.log(`[room] ${room.code} finished; winner=${winnerState.name}; ${Math.round(entry.durationMs / 1000)}s`);
    room.cleanupTimer = setTimeout(() => closeRoom(room, 'expired', 'This race is over.'), ROOM_RETENTION_MS);
}
