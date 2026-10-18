'use strict';

/**
 * Small room-based WebSocket matchmaker for Maze.
 * One room = one exact (player count, target count) mode. Each room owns its own race state,
 * so multiple matches of the same or different modes can run concurrently.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const WebSocket = require('ws');

const PORT = Number(process.env.PORT || 8080);
// When run from the full repository, serve the web app and WebSocket endpoint from
// one local origin. On a deployment whose root directory is `server/`, fall back to
// API/WebSocket-only mode because the front-end files are not part of that directory.
const FRONTEND_CANDIDATE = path.resolve(__dirname, '..');
const FRONTEND_ROOT = fs.existsSync(path.join(FRONTEND_CANDIDATE, 'index.html'))
    ? FRONTEND_CANDIDATE
    : null;
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ico': 'image/x-icon'
};
const SIZE = 42;
const CELLS = SIZE * SIZE;
const VALID_GOALS = new Set([3, 6, 9]);
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;
const ROOM_RETENTION_MS = 3 * 60 * 1000;
const PREPARE_TIMEOUT_MS = 20 * 1000;
const COLORS = [
    '#36b8ff', '#ffc857', '#4dd4ac', '#bd8cff', '#ff8a45',
    '#6de0eb', '#f48fb1', '#b5e36b', '#d0d7de', '#e879f9'
];

const httpServer = http.createServer((req, res) => {
    let pathname;
    try {
        pathname = new URL(req.url, 'http://localhost').pathname;
    } catch (_) {
        res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Bad request');
        return;
    }

    if (pathname === '/health') {
        const body = JSON.stringify({
            status: 'ok',
            service: 'maze-multiplayer',
            onlinePlayers: clients.size,
            waitingPlayers: waitingPlayerCount(),
            activeRooms: rooms.size,
            frontendServed: Boolean(FRONTEND_ROOT)
        });
        res.writeHead(200, {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
            'access-control-allow-origin': '*'
        });
        res.end(body);
        return;
    }

    if (FRONTEND_ROOT && req.method === 'GET' && pathname !== '/health') {
        let decodedPath;
        try { decodedPath = decodeURIComponent(pathname); }
        catch (_) {
            res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
            res.end('Bad path');
            return;
        }
        const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
        const filePath = path.resolve(FRONTEND_ROOT, relativePath);
        const allowedPath = filePath === FRONTEND_ROOT || filePath.startsWith(FRONTEND_ROOT + path.sep);
        if (allowedPath && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            res.writeHead(200, {
                'content-type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
                'cache-control': /\.(html|js|mjs|css)$/.test(filePath) ? 'no-cache' : 'public, max-age=86400',
                'x-content-type-options': 'nosniff'
            });
            fs.createReadStream(filePath).pipe(res);
            return;
        }
    }

    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
});

const wss = new WebSocket.Server({ server: httpServer, maxPayload: 64 * 1024 });
const clients = new Map();
const queues = new Map();
const rooms = new Map();
let nextPlayerNumber = 1;

function safeSend(socket, payload) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    try { socket.send(JSON.stringify(payload)); return true; }
    catch (_) { return false; }
}
function sendToPlayer(id, payload) {
    const peer = clients.get(id);
    return peer ? safeSend(peer.socket, payload) : false;
}
function cleanName(value) {
    const name = String(value || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 24);
    return name || 'Player';
}
function queueKey(players, goals) { return `${players}:${goals}`; }
function waitingPlayerCount() {
    let total = 0;
    for (const queue of queues.values()) total += queue.length;
    return total;
}
function currentCounts() {
    const waitingByPlayers = {};
    const waitingByMode = {};
    for (let players = MIN_PLAYERS; players <= MAX_PLAYERS; players++) waitingByPlayers[players] = 0;
    for (const [key, ids] of queues) {
        const [players, goals] = key.split(':').map(Number);
        waitingByPlayers[players] = (waitingByPlayers[players] || 0) + ids.length;
        waitingByMode[key] = ids.length;
    }
    return {
        waitingByPlayers,
        waitingByMode,
        onlinePlayers: clients.size,
        waitingPlayers: waitingPlayerCount(),
        activeRooms: rooms.size
    };
}
function broadcastCounts() {
    const payload = { type: 'lobby:counts', counts: currentCounts() };
    for (const peer of clients.values()) safeSend(peer.socket, payload);
}
function announceQueue(key) {
    const queue = queues.get(key) || [];
    const [players, goals] = key.split(':').map(Number);
    const payload = {
        type: 'queue:waiting',
        players,
        goals,
        waitingPlayers: queue.length,
        requiredPlayers: players
    };
    for (const id of queue) sendToPlayer(id, payload);
}
function removeFromQueue(peer) {
    if (!peer || !peer.queueKey) return;
    const key = peer.queueKey;
    const queue = queues.get(key);
    if (queue) {
        const index = queue.indexOf(peer.id);
        if (index >= 0) queue.splice(index, 1);
        if (!queue.length) queues.delete(key);
    }
    peer.queueKey = null;
    if (queues.has(key)) announceQueue(key);
}
function publicPlayers(room) {
    return room.playerOrder.map(id => {
        const p = room.playerStates.get(id);
        return {
            id: p.id,
            name: p.name,
            color: p.color,
            position: p.position,
            steps: p.steps,
            goals: p.goals,
            collected: p.collected.slice(),
            finished: p.finished,
            connected: clients.has(id) && !p.left
        };
    });
}
function sendRoom(room, payload) {
    for (const id of room.playerOrder) sendToPlayer(id, payload);
}
function updateRoom(room, lastMove = null) {
    sendRoom(room, {
        type: 'room:update',
        roomId: room.id,
        phase: room.phase,
        players: publicPlayers(room),
        lastMove
    });
}
function clearRoom(room) {
    if (!room || !rooms.has(room.id)) return;
    if (room.prepareTimer) clearTimeout(room.prepareTimer);
    if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
    for (const id of room.playerOrder) {
        const peer = clients.get(id);
        if (peer && peer.roomId === room.id) peer.roomId = null;
    }
    rooms.delete(room.id);
}
function abortRoom(room, message) {
    if (!room) return;
    console.warn(`[match] room ${room.id} aborted: ${message || 'unspecified error'}`);
    sendRoom(room, { type: 'match:error', message: message || 'This match could not be started. Please queue again.' });
    clearRoom(room);
    broadcastCounts();
}
function makeRoom(ids, playersRequired, goals) {
    const room = {
        id: randomUUID(),
        playersRequired,
        goalCount: goals,
        phase: 'preparing',
        hostId: ids[0],
        playerOrder: ids.slice(),
        playerStates: new Map(),
        maze: null,
        winnerId: null,
        startedAt: null,
        prepareTimer: null,
        cleanupTimer: null
    };
    ids.forEach((id, index) => {
        const peer = clients.get(id);
        if (!peer) return;
        peer.queueKey = null;
        peer.roomId = room.id;
        peer.selectedPlayers = playersRequired;
        peer.selectedGoals = goals;
        room.playerStates.set(id, {
            id,
            name: peer.name,
            color: COLORS[index % COLORS.length],
            position: 0,
            steps: 0,
            goals: 0,
            collected: Array(goals).fill(false),
            finished: false,
            left: false
        });
    });
    rooms.set(room.id, room);
    console.log(`[match] room ${room.id} forming; players=${playersRequired}; goals=${goals}`);
    for (const id of room.playerOrder) {
        sendToPlayer(id, {
            type: 'room:forming',
            roomId: room.id,
            players: playersRequired,
            goals,
            waitingPlayers: playersRequired,
            requiredPlayers: playersRequired
        });
    }
    sendToPlayer(room.hostId, { type: 'room:host', roomId: room.id, goals: room.goalCount });
    room.prepareTimer = setTimeout(() => {
        if (rooms.has(room.id) && room.phase === 'preparing') {
            abortRoom(room, 'The host took too long to prepare the maze. Please try again.');
        }
    }, PREPARE_TIMEOUT_MS);
    return room;
}
function tryMakeMatches(key) {
    const queue = queues.get(key);
    if (!queue) return;
    const [players, goals] = key.split(':').map(Number);
    while (queue.length >= players) {
        const batch = queue.splice(0, players).filter(id => clients.has(id));
        if (batch.length !== players) continue;
        makeRoom(batch, players, goals);
    }
    if (!queue.length) queues.delete(key);
    else announceQueue(key);
}
function joinQueue(peer, message) {
    if (peer.roomId) {
        console.warn(`[queue] rejected join for player=${peer.id}; already in room=${peer.roomId}`);
        safeSend(peer.socket, { type: 'match:error', message: 'You are already in a match.' });
        return;
    }
    const players = Number(message.players);
    const goals = Number(message.goals);
    if (!Number.isInteger(players) || players < MIN_PLAYERS || players > MAX_PLAYERS ||
        !VALID_GOALS.has(goals)) {
        console.warn(`[queue] rejected invalid mode from player=${peer.id}: players=${message.players}; goals=${message.goals}`);
        safeSend(peer.socket, { type: 'match:error', message: 'Choose 2–10 players and 3, 6, or 9 targets.' });
        return;
    }
    removeFromQueue(peer);
    peer.name = cleanName(message.name);
    peer.selectedPlayers = players;
    peer.selectedGoals = goals;
    const key = queueKey(players, goals);
    if (!queues.has(key)) queues.set(key, []);
    const queue = queues.get(key);
    if (!queue.includes(peer.id)) {
        queue.push(peer.id);
        peer.queueKey = key;
    }
    announceQueue(key);
    console.log(`[queue] player joined mode ${key}; waiting=${queue.length}/${players}`);
    tryMakeMatches(key);
    broadcastCounts();
}
function validMazePayload(maze, goalCount) {
    if (!maze || typeof maze.maze !== 'string' || maze.maze.length !== CELLS) return false;
    if (!/^[0-9a-f]+$/i.test(maze.maze)) return false;
    if (!Number.isInteger(maze.start) || maze.start < 0 || maze.start >= CELLS) return false;
    if (!Array.isArray(maze.exits) || maze.exits.length !== goalCount) return false;
    const seen = new Set([maze.start]);
    for (const exit of maze.exits) {
        if (!Number.isInteger(exit) || exit < 0 || exit >= CELLS || seen.has(exit)) return false;
        seen.add(exit);
    }
    return true;
}
function publishMaze(peer, message) {
    const room = rooms.get(peer.roomId);
    if (!room || room.phase !== 'preparing' || room.hostId !== peer.id) {
        safeSend(peer.socket, { type: 'match:error', message: 'You are not the host of a lobby that is preparing.' });
        return;
    }
    if (!validMazePayload(message.maze, room.goalCount)) {
        console.error(`[match] room ${room.id} rejected host maze payload; expected cells=${CELLS}, goals=${room.goalCount}`);
        abortRoom(room, 'The generated maze data was invalid. Please start a new lobby.');
        return;
    }
    const raw = message.maze;
    room.maze = {
        maze: raw.maze.toLowerCase(),
        start: raw.start,
        exits: raw.exits.slice(),
        goalCount: room.goalCount
    };
    room.phase = 'playing';
    room.startedAt = Date.now();
    console.log(`[match] room ${room.id} started; connectedPlayers=${room.playerOrder.length}; goals=${room.goalCount}`);
    if (room.prepareTimer) clearTimeout(room.prepareTimer);
    for (const id of room.playerOrder) {
        const state = room.playerStates.get(id);
        state.position = room.maze.start;
        state.steps = 0;
        state.goals = 0;
        state.collected = Array(room.goalCount).fill(false);
        state.finished = false;
        state.left = false;
    }
    const players = publicPlayers(room);
    for (const id of room.playerOrder) {
        sendToPlayer(id, {
            type: 'game:start',
            roomId: room.id,
            maze: room.maze,
            players,
            ownPlayerId: id,
            goalCount: room.goalCount,
            startedAt: room.startedAt
        });
    }
    updateRoom(room);
    broadcastCounts();
}
function nextCell(cell, direction) {
    const row = Math.floor(cell / SIZE);
    const col = cell % SIZE;
    if (direction === 0 && row > 0) return cell - SIZE;
    if (direction === 1 && col < SIZE - 1) return cell + 1;
    if (direction === 2 && row < SIZE - 1) return cell + SIZE;
    if (direction === 3 && col > 0) return cell - 1;
    return -1;
}
function playerMove(peer, message) {
    const room = rooms.get(peer.roomId);
    if (!room || room.phase !== 'playing' || room.winnerId) return;
    const state = room.playerStates.get(peer.id);
    const direction = Number(message.direction);
    if (!state || state.left || !Number.isInteger(direction) || direction < 0 || direction > 3) return;
    const currentMask = parseInt(room.maze.maze[state.position], 16);
    const target = nextCell(state.position, direction);
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
        state.collected[state.goals] = true;
        state.goals++;
    }
    let winner = false;
    if (state.goals >= room.goalCount) {
        state.finished = true;
        room.winnerId = state.id;
        room.phase = 'finished';
        winner = true;
    }
    updateRoom(room, {
        id: state.id,
        direction,
        from,
        to: target,
        collectedGoal
    });
    if (winner) {
        const winnerState = room.playerStates.get(room.winnerId);
        sendRoom(room, {
            type: 'game:finish',
            roomId: room.id,
            winnerId: room.winnerId,
            winnerName: winnerState ? winnerState.name : 'Player',
            players: publicPlayers(room)
        });
        room.cleanupTimer = setTimeout(() => clearRoom(room), ROOM_RETENTION_MS);
    }
}
function leaveQueue(peer) {
    removeFromQueue(peer);
    safeSend(peer.socket, { type: 'queue:left' });
    broadcastCounts();
}
function leaveRoom(peer) {
    const room = rooms.get(peer.roomId);
    if (!room) {
        peer.roomId = null;
        safeSend(peer.socket, { type: 'room:left' });
        return;
    }
    if (room.phase === 'preparing') {
        const roomId = room.id;
        abortRoom(room, 'A player left before the race started. Please queue again.');
        peer.roomId = null;
        safeSend(peer.socket, { type: 'room:left', roomId });
        return;
    }
    const state = room.playerStates.get(peer.id);
    if (state) state.left = true;
    peer.roomId = null;
    const hasActivePlayers = room.playerOrder.some(id => {
        const item = room.playerStates.get(id);
        return item && !item.left && clients.has(id);
    });
    if (hasActivePlayers) updateRoom(room);
    else clearRoom(room);
    safeSend(peer.socket, { type: 'room:left', roomId: room.id });
}
function handleDisconnect(peer) {
    clients.delete(peer.id);
    removeFromQueue(peer);
    if (peer.roomId) {
        const room = rooms.get(peer.roomId);
        if (room) {
            // A room must not start with fewer people than its selected player count.
            if (room.phase === 'preparing') {
                abortRoom(room, peer.id === room.hostId
                    ? 'The lobby host disconnected before the race could start.'
                    : 'A player disconnected before the race could start. Please queue again.');
            } else {
                const hasActivePlayers = room.playerOrder.some(id => {
                    const state = room.playerStates.get(id);
                    return state && !state.left && clients.has(id);
                });
                if (hasActivePlayers) updateRoom(room);
                else clearRoom(room);
            }
        }
    }
    broadcastCounts();
}

wss.on('connection', socket => {
    const id = randomUUID();
    const peer = {
        id,
        number: nextPlayerNumber++,
        name: `Player ${nextPlayerNumber - 1}`,
        socket,
        queueKey: null,
        roomId: null,
        selectedPlayers: 0,
        selectedGoals: 0
    };
    clients.set(id, peer);
    console.log(`[ws] connected player=${id}; online=${clients.size}`);
    safeSend(socket, {
        type: 'connected',
        playerId: id,
        playerName: peer.name,
        serverTime: Date.now()
    });
    broadcastCounts();

    socket.on('message', raw => {
        let message;
        try { message = JSON.parse(raw.toString()); }
        catch (_) { safeSend(socket, { type: 'protocol:error', message: 'Invalid JSON message.' }); return; }
        if (!message || typeof message.type !== 'string') return;
        switch (message.type) {
            case 'lobby:watch':
                safeSend(socket, { type: 'lobby:counts', counts: currentCounts() });
                break;
            case 'queue:join':
                joinQueue(peer, message);
                break;
            case 'queue:leave':
                leaveQueue(peer);
                break;
            case 'room:leave':
                leaveRoom(peer);
                break;
            case 'maze:publish':
                publishMaze(peer, message);
                break;
            case 'player:move':
                playerMove(peer, message);
                break;
            default:
                safeSend(socket, { type: 'protocol:error', message: 'Unknown message type.' });
        }
    });
    socket.on('close', () => handleDisconnect(peer));
    socket.on('error', () => { /* The close handler owns lifecycle cleanup. */ });
});

httpServer.on('error', error => {
    if (error && error.code === 'EADDRINUSE') {
        console.error(`[startup] Port ${PORT} is already in use. Stop the other service on this port, or launch with a different PORT and enter the matching WebSocket URL in the game settings.`);
    } else {
        console.error('[startup] HTTP/WebSocket server failed to start:', error);
    }
    process.exit(1);
});

httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Maze multiplayer server listening on port ${PORT}`);
    if (FRONTEND_ROOT) {
        console.log(`Local game: http://127.0.0.1:${PORT}/`);
        console.log(`Health check: http://127.0.0.1:${PORT}/health`);
        console.log(`WebSocket: ws://127.0.0.1:${PORT}`);
    } else {
        console.log(`Health check: http://127.0.0.1:${PORT}/health`);
        console.log('Frontend files are not beside server.js; deploy the web client separately.');
    }
});
