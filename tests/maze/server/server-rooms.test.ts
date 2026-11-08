/**
 * Integration tests for the room-based multiplayer server (protocol v2).
 * Every test starts its own server process on a random port with short timers, so tests cannot leak state
 * into each other. Real WebSocket clients drive real races on real generated mazes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { generateMazeData, DR, DC } from '@maze/shared';

const SERVER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../dist/maze-server/server.cjs');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/* ── Server process ────────────────────────────────────────────────────── */
function startServer(env = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [SERVER], {
            env: {
                ...process.env,
                MAZE_PORT: '0',
                MAZE_PREPARE_TIMEOUT_MS: '700',
                MAZE_LOBBY_FLUSH_MS: '40',
                MAZE_HEARTBEAT_MS: '60000',
                MAZE_ROOM_RETENTION_MS: '1500',
                ...env
            },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let out = '';
        let settled = false;
        const clients = [];
        const timer = setTimeout(() => { if (!settled) { settled = true; child.kill(); reject(new Error('server did not start:\n' + out)); } }, 8000);
        child.stdout.on('data', chunk => {
            out += chunk;
            const match = /listening on port (\d+)/.exec(out);
            if (match && !settled) {
                settled = true;
                clearTimeout(timer);
                const port = Number(match[1]);
                const server = {
                    port,
                    child,
                    clients,
                    get log() { return out; },
                    async client() {
                        const c = await Client.open(port);
                        clients.push(c);
                        return c;
                    },
                    async json(p) {
                        const response = await fetch(`http://127.0.0.1:${port}${p}`);
                        return response.json();
                    },
                    async stop() {
                        for (const c of clients) c.ws.terminate();
                        child.kill();
                        await new Promise(r => child.once('exit', r));
                    }
                };
                resolve(server);
            }
        });
        child.stderr.on('data', chunk => { out += chunk; });
        child.once('exit', code => { if (!settled) { settled = true; clearTimeout(timer); reject(new Error(`server exited early (${code}):\n${out}`)); } });
    });
}
async function withServer(env, fn) {
    if (typeof env === 'function') { fn = env; env = {}; }
    const server = await startServer(env);
    try { await fn(server); }
    finally { await server.stop(); }
}

/* ── Client with an inbox you can wait on ──────────────────────────────── */
class Client {
    constructor(ws) {
        this.ws = ws;
        this.history = [];
        this.inbox = [];
        this.waiters = [];
        this.id = '';
        this.closed = false;
        ws.on('message', raw => this.receive(String(raw)));
        ws.on('close', () => { this.closed = true; });
    }
    static open(port) {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(`ws://127.0.0.1:${port}`);
            const client = new Client(ws);
            ws.once('error', reject);
            client.waitFor('connected').then(hello => { client.id = hello.playerId; client.hello = hello; resolve(client); }, reject);
        });
    }
    receive(raw) {
        let message;
        try { message = JSON.parse(raw); } catch (_) { return; }
        this.history.push(message);
        for (let i = 0; i < this.waiters.length; i++) {
            const w = this.waiters[i];
            if (w.type === message.type && w.pred(message)) {
                this.waiters.splice(i, 1);
                clearTimeout(w.timer);
                w.resolve(message);
                return;
            }
        }
        this.inbox.push(message);
    }
    send(message) { this.ws.send(JSON.stringify(message)); }
    raw(text) { this.ws.send(text); }
    /** Resolves with the next message of `type` (oldest unconsumed first) that satisfies `pred`. */
    waitFor(type, pred = () => true, ms = 4000) {
        const index = this.inbox.findIndex(m => m.type === type && pred(m));
        if (index >= 0) return Promise.resolve(this.inbox.splice(index, 1)[0]);
        return new Promise((resolve, reject) => {
            const waiter = { type, pred, resolve };
            waiter.timer = setTimeout(() => {
                this.waiters = this.waiters.filter(w => w !== waiter);
                const seen = this.history.slice(-8).map(m => m.type).join(', ');
                reject(new Error(`timed out waiting for "${type}" (last messages: ${seen || 'none'})`));
            }, ms);
            this.waiters.push(waiter);
        });
    }
    /** Asserts that no unconsumed message of `type` shows up within `ms`. */
    async expectNone(type, pred = () => true, ms = 300) {
        await sleep(ms);
        const hit = this.inbox.find(m => m.type === type && pred(m));
        assert.equal(hit, undefined, `unexpected "${type}": ${JSON.stringify(hit)}`);
    }
    find(type, pred = () => true) { return this.history.find(m => m.type === type && pred(m)); }
    all(type, pred = () => true) { return this.history.filter(m => m.type === type && pred(m)); }
    indexOf(type, pred = () => true) { return this.history.findIndex(m => m.type === type && pred(m)); }
    close() {
        if (this.closed) return Promise.resolve();
        return new Promise(resolve => { this.ws.once('close', resolve); this.ws.close(); });
    }
}

/* ── Mazes and walking ─────────────────────────────────────────────────── */
function route(code, size, from, to) {
    const prev = new Map([[from, null]]);
    const queue = [from];
    for (let i = 0; i < queue.length && !prev.has(to); i++) {
        const cell = queue[i];
        const mask = parseInt(code[cell], 16);
        for (let d = 0; d < 4; d++) {
            if (!(mask & (1 << d))) continue;
            const r = Math.floor(cell / size) + DR[d];
            const c = (cell % size) + DC[d];
            if (r < 0 || r >= size || c < 0 || c >= size) continue;
            const next = r * size + c;
            if (prev.has(next)) continue;
            prev.set(next, [cell, d]);
            queue.push(next);
        }
    }
    const dirs = [];
    for (let cell = to; cell !== from;) {
        const [before, d] = prev.get(cell);
        dirs.push(d);
        cell = before;
    }
    return dirs.reverse();
}
const STEP = (size, d) => [-size, 1, size, -1][d];
/** A valid maze payload; of a handful of candidates the one with the shortest tour is used, to keep races quick. */
function makeMaze(goals = 1, size = 21, { shortest = true } = {}) {
    let best = null;
    for (let attempt = 0; attempt < (shortest ? 6 : 1); attempt++) {
        const data = generateMazeData(goals, size);
        const code = Array.from(data.open, v => v.toString(16)).join('');
        let length = 0, at = data.startCell;
        for (const exit of data.exits) { length += route(code, size, at, exit).length; at = exit; }
        if (!best || length < best.length) best = { length, maze: code, start: data.startCell, exits: data.exits.slice(), goalTotal: goals };
    }
    const { length, ...payload } = best;
    return payload;
}
/** Walks a racer along the shortest route, confirming every step with the server's room:update. */
async function walk(client, payload, size, from, to) {
    let at = from;
    for (const d of route(payload.maze, size, from, to)) {
        const next = at + STEP(size, d);
        client.send({ type: 'player:move', direction: d });
        await client.waitFor('room:update', m => m.lastMove && m.lastMove.id === client.id && m.lastMove.to === next);
        at = next;
        await sleep(9); // stay under the server's per-connection rate limit
    }
    return at;
}

/** Opens a room with `n` clients (host first), has the host publish a maze and resolves once everyone is racing. */
async function startRace(srv, n, { size = 21, goals = 1 } = {}) {
    const clients = [];
    for (let i = 0; i < n; i++) clients.push(await srv.client());
    const host = clients[0];
    host.send({ type: 'room:create', size, players: n, goals, name: 'P0' });
    const { room } = await host.waitFor('room:joined');
    for (let i = 1; i < n; i++) {
        clients[i].send({ type: 'room:join', code: room.code, name: `P${i}` });
        await clients[i].waitFor('room:joined');
    }
    await host.waitFor('room:host');
    const maze = makeMaze(goals, size);
    host.send({ type: 'maze:publish', maze });
    const starts = await Promise.all(clients.map(c => c.waitFor('game:start')));
    return { clients, host, room, maze, size, goals, starts };
}
async function eventually(fn, ms = 4000) {
    const deadline = Date.now() + ms;
    let last;
    for (;;) {
        try { const value = await fn(); if (value) return value; last = value; } catch (error) { last = error; }
        if (Date.now() > deadline) throw new Error(`condition not met in ${ms} ms (${last instanceof Error ? last.message : JSON.stringify(last)})`);
        await sleep(25);
    }
}
const summaryOf = (message, id) => (message.upsert || []).find(r => r.id === id);

/* ── Basics ────────────────────────────────────────────────────────────── */
test('connected announces protocol 2 and the limits', () => withServer(async srv => {
    const a = await srv.client();
    assert.equal(a.hello.protocol, 2);
    assert.deepEqual(a.hello.limits.sizes, [21, 33, 45]);
    assert.equal(a.hello.limits.maxPlayers, 99);
    assert.ok(a.id.length > 10);
}));

test('/health and /rooms report the lobby as JSON', () => withServer(async srv => {
    const a = await srv.client();
    const b = await srv.client();
    a.send({ type: 'room:create', size: 33, players: 4, goals: 6, name: 'Ada' });
    await a.waitFor('room:joined');
    const health = await eventually(async () => { const h = await srv.json('/health'); return h.waitingRooms === 1 && h; });
    assert.equal(health.status, 'ok');
    assert.equal(health.protocol, 2);
    assert.equal(health.onlinePlayers, 2);
    assert.equal(health.activeRooms, 1);
    assert.equal(health.waitingPlayers, 1);
    const lobby = await srv.json('/rooms');
    assert.equal(lobby.rooms.length, 1);
    const [room] = lobby.rooms;
    assert.equal(room.phase, 'waiting');
    assert.equal(room.size, 33);
    assert.equal(room.capacity, 4);
    assert.equal(room.goals, 6);
    assert.equal(room.host, 'Ada');
    assert.deepEqual(room.seats, [0]);
    assert.deepEqual(lobby.recent, []);
    assert.equal(lobby.counts.waitingByMode['33:4:6'], 1);
    await b.close();
}));

test('malformed JSON, typeless JSON and unknown types', () => withServer(async srv => {
    const a = await srv.client();
    a.raw('{ not json');
    assert.equal((await a.waitFor('protocol:error')).message, 'Invalid JSON message.');
    a.raw(JSON.stringify({ nothing: true }));
    a.send({ type: 'does:not:exist' });
    assert.equal((await a.waitFor('protocol:error')).message, 'Unknown message type.');
    a.send({ type: 'lobby:watch' });
    await a.waitFor('lobby:state'); // the connection is still healthy
}));

test('a message flood is rate-limited and the server and the flooder recover', () => withServer(async srv => {
    const flooder = await srv.client();
    const bystander = await srv.client();
    for (let i = 0; i < 1500; i++) flooder.send({ type: 'does:not:exist' });
    await sleep(500);
    const replies = flooder.all('protocol:error').length;
    assert.ok(replies > 0 && replies < 600, `expected a trimmed number of replies, got ${replies}`);
    bystander.send({ type: 'lobby:watch' });
    await bystander.waitFor('lobby:state'); // others are unaffected
    assert.equal((await srv.json('/health')).status, 'ok');
    await sleep(1500); // the bucket refills
    flooder.send({ type: 'does:not:exist' });
    await flooder.waitFor('protocol:error', () => true, 2000);
    assert.ok(!flooder.closed, 'flooding must not disconnect anyone');
}));

/* ── Lobby ─────────────────────────────────────────────────────────────── */
test('lobby:watch delivers a snapshot, then patches for rooms and counts', () => withServer(async srv => {
    const watcher = await srv.client();
    watcher.send({ type: 'lobby:watch' });
    const state = await watcher.waitFor('lobby:state');
    assert.equal(state.protocol, 2);
    assert.deepEqual(state.rooms, []);
    assert.deepEqual(state.recent, []);
    assert.equal(state.counts.waitingRooms, 0);
    assert.ok(Math.abs(state.serverTime - Date.now()) < 5000);

    const host = await srv.client();
    host.send({ type: 'room:create', size: 21, players: 3, goals: 2, name: 'Host' });
    const joined = await host.waitFor('room:joined');
    assert.equal(joined.you, host.id);
    assert.equal(joined.room.phase, 'waiting');
    assert.match(joined.room.code, /^[A-HJ-NP-Z2-9]{4}$/);
    assert.equal(joined.room.capacity, 3);
    assert.equal(joined.room.hostId, host.id);
    assert.equal(joined.room.minStart, 2);
    assert.deepEqual(joined.room.members.map(m => [m.name, m.host, m.seat]), [['Host', true, 0]]);

    const patch = await watcher.waitFor('lobby:patch', m => summaryOf(m, joined.room.id));
    const summary = summaryOf(patch, joined.room.id);
    assert.equal(summary.code, joined.room.code);
    assert.equal(summary.count, 1);
    assert.equal(summary.host, 'Host');
    assert.deepEqual(summary.names, ['Host']);
    assert.deepEqual(summary.seats, [0]);
    assert.equal(patch.counts.waitingRooms, 1);
    assert.equal(patch.counts.waitingByMode['21:3:2'], 1);
    assert.equal(patch.counts.onlinePlayers, 2);
}));

test('an unwatched client gets no lobby traffic', () => withServer(async srv => {
    const quiet = await srv.client();
    const host = await srv.client();
    host.send({ type: 'room:create', size: 21, players: 2, goals: 1 });
    await host.waitFor('room:joined');
    await quiet.expectNone('lobby:patch', () => true, 250);
    quiet.send({ type: 'lobby:watch' });
    const state = await quiet.waitFor('lobby:state');
    assert.equal(state.rooms.length, 1);
    quiet.send({ type: 'lobby:unwatch' });
    await sleep(80);
    const other = await srv.client();
    other.send({ type: 'room:create', size: 33, players: 2, goals: 1 });
    await other.waitFor('room:joined');
    await quiet.expectNone('lobby:patch', () => true, 250);
}));

test('counts.waitingByMode is keyed size:players:goals and sums seats', () => withServer(async srv => {
    const watcher = await srv.client();
    watcher.send({ type: 'lobby:watch' });
    await watcher.waitFor('lobby:state');
    const [a, b, c] = [await srv.client(), await srv.client(), await srv.client()];
    a.send({ type: 'room:quick', size: 33, players: 4, goals: 6, name: 'A' });
    b.send({ type: 'room:quick', size: 33, players: 4, goals: 6, name: 'B' });
    c.send({ type: 'room:quick', size: 45, players: 9, goals: 99, name: 'C' });
    const patch = await watcher.waitFor('lobby:patch', m => m.counts.waitingPlayers === 3);
    assert.deepEqual(patch.counts.waitingByMode, { '33:4:6': 2, '45:9:99': 1 });
    assert.equal(patch.counts.waitingRooms, 2);
}));

/* ── Creating and joining ──────────────────────────────────────────────── */
test('invalid set-ups are refused for create and quick', () => withServer(async srv => {
    const a = await srv.client();
    const bad = [
        { size: 22, players: 3, goals: 3 },
        { size: 21, players: 1, goals: 3 },
        { size: 21, players: 100, goals: 3 },
        { size: 21, players: 3, goals: 0 },
        { size: 21, players: 3, goals: 100 },
        { size: 21, players: 2.5, goals: 3 },
        { size: '33; DROP', players: 3, goals: 3 },
        { size: 21, goals: 3 }
    ];
    for (const kind of ['room:create', 'room:quick', 'queue:join']) {
        for (const setup of bad) {
            a.send({ type: kind, ...setup });
            const error = await a.waitFor('room:error');
            assert.equal(error.code, 'invalid', `${kind} ${JSON.stringify(setup)}`);
        }
    }
    assert.equal((await srv.json('/rooms')).rooms.length, 0);
}));

test('joining by room id and by lower-case code; members and seats', () => withServer(async srv => {
    const [a, b, c] = [await srv.client(), await srv.client(), await srv.client()];
    a.send({ type: 'room:create', size: 21, players: 4, goals: 2, name: 'Ann' });
    const { room } = await a.waitFor('room:joined');

    b.send({ type: 'room:join', roomId: room.id, name: 'Bob' });
    const joinedB = await b.waitFor('room:joined');
    assert.equal(joinedB.room.id, room.id);
    assert.deepEqual(joinedB.room.members.map(m => m.name), ['Ann', 'Bob']);
    const stateA = await a.waitFor('room:state', m => m.room.members.length === 2);
    assert.equal(stateA.room.phase, 'waiting');

    c.send({ type: 'room:join', code: room.code.toLowerCase(), name: 'Cy' });
    const joinedC = await c.waitFor('room:joined');
    assert.deepEqual(joinedC.room.members.map(m => [m.name, m.seat, m.host]), [['Ann', 0, true], ['Bob', 1, false], ['Cy', 2, false]]);
    assert.equal(new Set(joinedC.room.members.map(m => m.color)).size, 3, 'seat colours are distinct');
    await b.waitFor('room:state', m => m.room.members.length === 3);
    assert.equal((await srv.json('/rooms')).rooms[0].count, 3);
}));

test('a freed seat is reused, so seat colours stay stable', () => withServer(async srv => {
    const [a, b, c, d] = [await srv.client(), await srv.client(), await srv.client(), await srv.client()];
    a.send({ type: 'room:create', size: 21, players: 5, goals: 2, name: 'A' });
    const { room } = await a.waitFor('room:joined');
    for (const [client, name] of [[b, 'B'], [c, 'C']]) { client.send({ type: 'room:join', code: room.code, name }); await client.waitFor('room:joined'); }
    const colourOfC = (await c.waitFor('room:state', () => true, 500).catch(() => null)) || null;
    b.send({ type: 'room:leave' });
    await b.waitFor('room:left');
    d.send({ type: 'room:join', code: room.code, name: 'D' });
    const joined = await d.waitFor('room:joined');
    const byName = Object.fromEntries(joined.room.members.map(m => [m.name, m.seat]));
    assert.deepEqual(byName, { A: 0, D: 1, C: 2 }, 'D takes the seat B left');
    assert.equal(colourOfC === null || colourOfC.room.members.find(m => m.name === 'C').seat === 2, true);
}));

test('join errors: not-found, started (with room id hint), busy', () => withServer(async srv => {
    const [a, b, c, d] = [await srv.client(), await srv.client(), await srv.client(), await srv.client()];
    d.send({ type: 'room:join', roomId: 'no-such-room' });
    assert.equal((await d.waitFor('room:error')).code, 'not-found');
    d.send({ type: 'room:join', code: 'ZZZZ' });
    assert.equal((await d.waitFor('room:error')).code, 'not-found');
    d.send({ type: 'room:join' });
    assert.equal((await d.waitFor('room:error')).code, 'not-found');

    a.send({ type: 'room:create', size: 21, players: 2, goals: 1, name: 'A' });
    const { room } = await a.waitFor('room:joined');
    // already in a room: create / join / quick are all refused
    a.send({ type: 'room:create', size: 21, players: 2, goals: 1 });
    assert.equal((await a.waitFor('room:error')).code, 'busy');
    a.send({ type: 'room:join', code: room.code });
    assert.equal((await a.waitFor('room:error')).code, 'busy');
    a.send({ type: 'room:quick', size: 21, players: 2, goals: 1 });
    assert.equal((await a.waitFor('room:error')).code, 'busy');

    b.send({ type: 'room:join', code: room.code, name: 'B' });
    await b.waitFor('room:joined'); // the room is now full and preparing
    c.send({ type: 'room:join', code: room.code, name: 'C' });
    const starting = await c.waitFor('room:error');
    assert.equal(starting.code, 'started');
    assert.equal(starting.roomId, room.id);

    await a.waitFor('room:host');
    const payload = makeMaze(1, 21);
    a.send({ type: 'maze:publish', maze: payload });
    await a.waitFor('game:start');
    c.send({ type: 'room:join', roomId: room.id, name: 'C' });
    const running = await c.waitFor('room:error');
    assert.equal(running.code, 'started');
    assert.equal(running.roomId, room.id, 'the hint lets the client offer "watch instead"');
}));

test('room:quick pairs identical set-ups, separates different ones, honours separate:true', () => withServer(async srv => {
    const [a, b, c, d, e] = await Promise.all([1, 2, 3, 4, 5].map(() => srv.client()));
    const setup = { size: 33, players: 3, goals: 4 };
    a.send({ type: 'room:quick', ...setup, name: 'A' });
    const ja = await a.waitFor('room:joined');
    b.send({ type: 'room:quick', ...setup, name: 'B' });
    const jb = await b.waitFor('room:joined');
    assert.equal(jb.room.id, ja.room.id, 'same set-up shares a room');
    assert.equal(jb.room.members.length, 2);

    c.send({ type: 'room:quick', size: 33, players: 3, goals: 5, name: 'C' });
    const jc = await c.waitFor('room:joined');
    assert.notEqual(jc.room.id, ja.room.id, 'different goals → different room');
    d.send({ type: 'room:quick', size: 45, players: 3, goals: 4, name: 'D' });
    assert.notEqual((await d.waitFor('room:joined')).room.id, ja.room.id, 'different size → different room');

    e.send({ type: 'room:quick', ...setup, separate: true, name: 'E' });
    const je = await e.waitFor('room:joined');
    assert.notEqual(je.room.id, ja.room.id, 'separate:true opens a new room even though one is waiting');
    assert.equal(je.room.members.length, 1);
    assert.equal((await srv.json('/rooms')).rooms.length, 4);
}));

test('quick match prefers the fullest matching room', () => withServer(async srv => {
    const clients = await Promise.all([1, 2, 3, 4, 5].map(() => srv.client()));
    const [a, b, c, d, e] = clients;
    const setup = { size: 21, players: 4, goals: 2 };
    a.send({ type: 'room:quick', ...setup });
    const first = (await a.waitFor('room:joined')).room;
    b.send({ type: 'room:quick', ...setup, separate: true });
    const second = (await b.waitFor('room:joined')).room;
    c.send({ type: 'room:join', roomId: second.id });
    await c.waitFor('room:joined');
    d.send({ type: 'room:quick', ...setup });
    assert.equal((await d.waitFor('room:joined')).room.id, second.id, 'the 2/4 room beats the 1/4 room');
    assert.notEqual(first.id, second.id);
    e.send({ type: 'room:quick', ...setup });
    await e.waitFor('room:joined');
}));

/* ── Starting a race ───────────────────────────────────────────────────── */
test('a full room prepares: room:host goes to the host only; publish starts everybody with distinct colours', () => withServer(async srv => {
    const payload = makeMaze(2, 21);
    const [a, b, c] = [await srv.client(), await srv.client(), await srv.client()];
    const watcher = await srv.client();
    watcher.send({ type: 'lobby:watch' });
    await watcher.waitFor('lobby:state');
    a.send({ type: 'room:create', size: 21, players: 3, goals: 2, name: 'Host' });
    const { room } = await a.waitFor('room:joined');
    b.send({ type: 'room:join', code: room.code, name: 'B' });
    await b.waitFor('room:joined');
    c.send({ type: 'room:join', code: room.code, name: 'C' });
    await c.waitFor('room:joined');

    const preparing = await b.waitFor('room:state', m => m.room.phase === 'preparing');
    assert.equal(preparing.room.members.length, 3);
    const hostMsg = await a.waitFor('room:host');
    assert.deepEqual([hostMsg.roomId, hostMsg.goals, hostMsg.size], [room.id, 2, 21]);
    await b.expectNone('room:host');
    await c.expectNone('room:host');
    const patch = await watcher.waitFor('lobby:patch', m => summaryOf(m, room.id) && summaryOf(m, room.id).phase === 'preparing');
    assert.equal(summaryOf(patch, room.id).count, 3);

    a.send({ type: 'maze:publish', maze: payload });
    const starts = await Promise.all([a, b, c].map(client => client.waitFor('game:start')));
    starts.forEach((start, i) => {
        assert.equal(start.roomId, room.id);
        assert.equal(start.code, room.code);
        assert.equal(start.ownPlayerId, [a, b, c][i].id);
        assert.equal(start.goalCount, 2);
        assert.equal(start.maze.maze, payload.maze);
        assert.equal(start.maze.size, 21);
        assert.equal(start.maze.start, payload.start);
        assert.deepEqual(start.maze.exits, payload.exits);
        assert.equal(start.players.length, 3);
        assert.ok(start.players.every(p => p.position === payload.start && p.steps === 0 && p.goals === 0 && p.connected));
        assert.equal(new Set(start.players.map(p => p.color)).size, 3, 'colours are unique');
        assert.ok(Math.abs(start.startedAt - Date.now()) < 5000);
    });
    const live = await watcher.waitFor('lobby:patch', m => summaryOf(m, room.id) && summaryOf(m, room.id).phase === 'playing');
    const summary = summaryOf(live, room.id);
    assert.equal(summary.racers, 3);
    assert.equal(summary.count, 3);
    assert.deepEqual(summary.leader && summary.leader.goals, 0);
    assert.equal(live.counts.liveRooms, 1);
    assert.equal(live.counts.waitingRooms, 0);
}));

test('an invalid maze closes the room for everybody', () => withServer(async srv => {
    const { clients, host } = await (async () => {
        const [a, b] = [await srv.client(), await srv.client()];
        a.send({ type: 'room:create', size: 21, players: 2, goals: 2 });
        const { room } = await a.waitFor('room:joined');
        b.send({ type: 'room:join', code: room.code });
        await b.waitFor('room:joined');
        await a.waitFor('room:host');
        return { clients: [a, b], host: a };
    })();
    const good = makeMaze(2, 21);
    host.send({ type: 'maze:publish', maze: { ...good, maze: good.maze.slice(1) } });
    for (const c of clients) {
        const closed = await c.waitFor('room:closed');
        assert.equal(closed.reason, 'bad-maze');
    }
    await eventually(async () => (await srv.json('/rooms')).rooms.length === 0);
}));

test('bad maze payload variants are all rejected', async () => {
    const variants = {
        'wrong goal count': m => ({ ...m, exits: m.exits.slice(1) }),
        'non-hex cells': m => ({ ...m, maze: 'z'.repeat(m.maze.length) }),
        'start out of range': m => ({ ...m, start: 99999 }),
        'duplicate exit': m => ({ ...m, exits: [m.exits[0], m.exits[0]] }),
        'exit on the start': m => ({ ...m, exits: [m.start, m.exits[1]] }),
        'no maze': () => null
    };
    for (const [name, mutate] of Object.entries(variants)) {
        await withServer(async srv => {
            const [a, b] = [await srv.client(), await srv.client()];
            a.send({ type: 'room:create', size: 21, players: 2, goals: 2 });
            const { room } = await a.waitFor('room:joined');
            b.send({ type: 'room:join', code: room.code });
            await b.waitFor('room:joined');
            await a.waitFor('room:host');
            a.send({ type: 'maze:publish', maze: mutate(makeMaze(2, 21, { shortest: false })) });
            const closed = await b.waitFor('room:closed');
            assert.equal(closed.reason, 'bad-maze', name);
        });
    }
});

test('a publish from somebody who is not the preparing host is stale', () => withServer(async srv => {
    const [a, b, outsider] = [await srv.client(), await srv.client(), await srv.client()];
    outsider.send({ type: 'maze:publish', maze: makeMaze(1, 21, { shortest: false }) });
    assert.equal((await outsider.waitFor('room:error')).code, 'stale');
    a.send({ type: 'room:create', size: 21, players: 3, goals: 1 });
    const { room } = await a.waitFor('room:joined');
    a.send({ type: 'maze:publish', maze: makeMaze(1, 21, { shortest: false }) });
    assert.equal((await a.waitFor('room:error')).code, 'stale', 'not preparing yet');
    b.send({ type: 'room:join', code: room.code });
    await b.waitFor('room:joined');
    const c = await srv.client();
    c.send({ type: 'room:join', code: room.code });
    await c.waitFor('room:joined');
    await a.waitFor('room:host');
    b.send({ type: 'maze:publish', maze: makeMaze(1, 21, { shortest: false }) });
    assert.equal((await b.waitFor('room:error')).code, 'stale', 'non-host');
    a.send({ type: 'maze:publish', maze: makeMaze(1, 21, { shortest: false }) });
    await a.waitFor('game:start');
}));

/* ── Racing ────────────────────────────────────────────────────────────── */
test('walls block, targets only count in order, the winner ends the race and lands on the recent shelf', () => withServer(async srv => {
    const watcher = await srv.client();
    watcher.send({ type: 'lobby:watch' });
    await watcher.waitFor('lobby:state');
    // A maze where the straight route to target 2 does not cross target 1.
    let race, maze;
    for (let attempt = 0; attempt < 30; attempt++) {
        maze = makeMaze(2, 21, { shortest: false });
        const [first, second] = maze.exits;
        const cells = new Set();
        let at = maze.start;
        for (const d of route(maze.maze, 21, maze.start, second)) { at += STEP(21, d); cells.add(at); }
        if (!cells.has(first)) break;
        maze = null;
    }
    assert.ok(maze, 'found a maze whose route to target 2 skips target 1');
    const [a, b] = [await srv.client(), await srv.client()];
    a.send({ type: 'room:create', size: 21, players: 2, goals: 2, name: 'Runner' });
    const { room } = await a.waitFor('room:joined');
    b.send({ type: 'room:join', code: room.code, name: 'Sitter' });
    await b.waitFor('room:joined');
    await a.waitFor('room:host');
    a.send({ type: 'maze:publish', maze });
    await a.waitFor('game:start');
    await b.waitFor('game:start');

    // a wall: any direction the start cell does not open
    const mask = parseInt(maze.maze[maze.start], 16);
    const wall = [0, 1, 2, 3].find(d => !(mask & (1 << d)));
    a.send({ type: 'player:move', direction: wall });
    assert.equal((await a.waitFor('player:blocked')).direction, wall);
    await b.expectNone('player:blocked');
    a.send({ type: 'player:move', direction: 7 }); // garbage is ignored, not fatal
    a.send({ type: 'player:move', direction: 'up' });

    // target 2 first: reached, but not collected
    const [first, second] = maze.exits;
    let at = await walk(a, maze, 21, maze.start, second);
    let update = a.history.filter(m => m.type === 'room:update').pop();
    assert.equal(update.players.find(p => p.id === a.id).goals, 0, 'target 2 is locked until target 1 is collected');
    assert.equal(update.lastMove.collectedGoal, null);
    assert.equal(update.players.find(p => p.id === a.id).position, second);
    const seenByB = await b.waitFor('room:update', m => m.lastMove && m.lastMove.id === a.id && m.lastMove.to === second);
    assert.equal(seenByB.players.find(p => p.id === a.id).position, second, 'everyone sees every move in a small room');

    // target 1 is collected, the lobby learns about the new leader
    at = await walk(a, maze, 21, at, first);
    update = a.history.filter(m => m.type === 'room:update').pop();
    assert.equal(update.lastMove.collectedGoal, 1);
    assert.equal(update.players.find(p => p.id === a.id).goals, 1);
    const leaderPatch = await watcher.waitFor('lobby:patch', m => { const s = summaryOf(m, room.id); return s && s.leader && s.leader.goals === 1; });
    assert.equal(summaryOf(leaderPatch, room.id).leader.name, 'Runner');

    // target 2 now counts and ends the race
    await walk(a, maze, 21, at, second);
    const finalUpdate = a.history.filter(m => m.type === 'room:update').pop();
    assert.equal(finalUpdate.lastMove.collectedGoal, 2);
    assert.equal(finalUpdate.phase, 'finished');
    const finishA = await a.waitFor('game:finish');
    const finishB = await b.waitFor('game:finish');
    for (const finish of [finishA, finishB]) {
        assert.equal(finish.winnerId, a.id);
        assert.equal(finish.winnerName, 'Runner');
        assert.equal(finish.players.find(p => p.id === a.id).finished, true);
    }
    assert.ok(a.indexOf('room:update', m => m.phase === 'finished') < a.indexOf('game:finish'), 'the deciding update precedes game:finish');
    const patch = await watcher.waitFor('lobby:patch', m => (m.remove || []).includes(room.id));
    assert.ok(patch.recent && patch.recent.length === 1, 'recent shelf is part of the patch');
    assert.deepEqual([patch.recent[0].winner, patch.recent[0].code, patch.recent[0].racers, patch.recent[0].goals], ['Runner', room.code, 2, 2]);
    assert.ok(patch.recent[0].durationMs > 0);
    assert.equal(patch.counts.liveRooms, 0);
    const rooms = await srv.json('/rooms');
    assert.equal(rooms.rooms.length, 0, 'a finished room is no longer listed');
    assert.equal(rooms.recent.length, 1);

    // nobody moves after the end
    b.inbox.length = 0;
    b.send({ type: 'player:move', direction: [0, 1, 2, 3].find(d => mask & (1 << d)) });
    await b.expectNone('room:update', m => m.lastMove, 250);
}));

test('a finished room is retired after the retention time', () => withServer(async srv => {
    const race = await startRace(srv, 2, { goals: 1 });
    const spectator = await srv.client();
    spectator.send({ type: 'lobby:watch' });
    await spectator.waitFor('lobby:state');
    spectator.send({ type: 'spectate:join', roomId: race.room.id });
    await spectator.waitFor('spectate:start');
    await walk(race.host, race.maze, 21, race.maze.start, race.maze.exits[0]);
    await spectator.waitFor('game:finish');
    assert.equal((await srv.json('/health')).activeRooms, 1);
    const ended = await spectator.waitFor('spectate:ended', () => true, 4000);
    assert.equal(ended.roomId, race.room.id);
    await eventually(async () => (await srv.json('/health')).activeRooms === 0);
    // the racers may now open or join something new without leaving explicitly
    race.clients[1].send({ type: 'room:create', size: 21, players: 2, goals: 1 });
    await race.clients[1].waitFor('room:joined');
}));

test('a racer who just finished can start a new game without an explicit room:leave', () => withServer(async srv => {
    const race = await startRace(srv, 2, { goals: 1 });
    await walk(race.host, race.maze, 21, race.maze.start, race.maze.exits[0]);
    await race.clients[1].waitFor('game:finish');
    race.clients[1].send({ type: 'room:quick', size: 33, players: 2, goals: 2, name: 'Again' });
    const joined = await race.clients[1].waitFor('room:joined');
    assert.notEqual(joined.room.id, race.room.id);
    race.clients[1].send({ type: 'room:quick', size: 33, players: 2, goals: 2, name: 'Again' });
    assert.equal((await race.clients[1].waitFor('room:error')).code, 'busy', 'but a live room still blocks');
}));

test('rooms above 12 racers coalesce updates: only the mover is answered at once', () => withServer(async srv => {
    const race = await startRace(srv, 13, { goals: 1 });
    const [mover, other] = [race.clients[0], race.clients[7]];
    const mask = parseInt(race.maze.maze[race.maze.start], 16);
    const open = [0, 1, 2, 3].find(d => mask & (1 << d));
    other.inbox.length = 0;
    mover.send({ type: 'player:move', direction: open });
    const own = await mover.waitFor('room:update', m => m.lastMove && m.lastMove.id === mover.id);
    assert.equal(own.players.length, 13);
    const snapshot = await other.waitFor('room:update', m => m.players.find(p => p.id === mover.id).steps === 1, 1500);
    assert.equal(snapshot.lastMove, null, 'others read a snapshot, not a per-move event');
}));

test('disconnecting mid-race marks the racer as gone; the last racer leaving closes the room', () => withServer(async srv => {
    const race = await startRace(srv, 3, { goals: 1 });
    const [a, b, c] = race.clients;
    await c.close();
    const update = await a.waitFor('room:update', m => m.players.some(p => p.connected === false));
    assert.equal(update.players.find(p => p.connected === false).id, c.id);
    assert.equal(update.spectators, 0);
    b.send({ type: 'room:leave' });
    await b.waitFor('room:left');
    await a.close();
    await eventually(async () => (await srv.json('/health')).activeRooms === 0);
}));

/* ── Early start, leaving, host migration ──────────────────────────────── */
test('host early start needs 2+ racers and only the host may press it', () => withServer(async srv => {
    const [a, b] = [await srv.client(), await srv.client()];
    a.send({ type: 'room:create', size: 21, players: 5, goals: 1, name: 'Host' });
    const { room } = await a.waitFor('room:joined');
    a.send({ type: 'room:start' });
    assert.equal((await a.waitFor('room:error')).code, 'need-players');
    b.send({ type: 'room:join', code: room.code, name: 'Guest' });
    await b.waitFor('room:joined');
    b.send({ type: 'room:start' });
    assert.equal((await b.waitFor('room:error')).code, 'not-host');
    const outsider = await srv.client();
    outsider.send({ type: 'room:start' });
    assert.equal((await outsider.waitFor('room:error')).code, 'not-waiting');

    a.send({ type: 'room:start' });
    await a.waitFor('room:host');
    assert.equal((await b.waitFor('room:state', m => m.room.phase === 'preparing')).room.members.length, 2);
    await b.expectNone('room:host');
    a.send({ type: 'maze:publish', maze: makeMaze(1, 21) });
    const [sa, sb] = await Promise.all([a.waitFor('game:start'), b.waitFor('game:start')]);
    assert.equal(sa.players.length, 2, 'the race starts with the two who are present');
    assert.equal(sb.players.length, 2);
    a.send({ type: 'room:start' });
    assert.equal((await a.waitFor('room:error')).code, 'not-waiting');
}));

test('when the host leaves a waiting room the oldest member inherits it', () => withServer(async srv => {
    const watcher = await srv.client();
    watcher.send({ type: 'lobby:watch' });
    await watcher.waitFor('lobby:state');
    const [a, b, c] = [await srv.client(), await srv.client(), await srv.client()];
    a.send({ type: 'room:create', size: 21, players: 4, goals: 1, name: 'Ann' });
    const { room } = await a.waitFor('room:joined');
    b.send({ type: 'room:join', code: room.code, name: 'Bob' });
    await b.waitFor('room:joined');
    c.send({ type: 'room:join', code: room.code, name: 'Cy' });
    await c.waitFor('room:joined');
    a.send({ type: 'room:leave' });
    assert.equal((await a.waitFor('room:left')).roomId, room.id);
    const afterLeave = await c.waitFor('room:state', m => m.room.members.length === 2);
    assert.equal(afterLeave.room.hostId, b.id);
    assert.deepEqual(afterLeave.room.members.map(m => [m.name, m.host]), [['Bob', true], ['Cy', false]]);
    const patch = await watcher.waitFor('lobby:patch', m => { const s = summaryOf(m, room.id); return s && s.host === 'Bob'; });
    assert.equal(summaryOf(patch, room.id).count, 2);
    b.ws.terminate(); // disconnecting counts as leaving
    const second = await c.waitFor('room:state', m => m.room.hostId === c.id);
    assert.equal(second.room.members.length, 1);
    c.send({ type: 'room:leave' });
    await c.waitFor('room:left');
    const gone = await watcher.waitFor('lobby:patch', m => (m.remove || []).includes(room.id));
    assert.equal(gone.counts.waitingRooms, 0);
    a.inbox.length = 0;
    await a.expectNone('room:state'); // the one who left hears nothing more
}));

test('a racer leaving during preparation: the rest still start when 2+ remain', () => withServer(async srv => {
    const [a, b, c] = [await srv.client(), await srv.client(), await srv.client()];
    a.send({ type: 'room:create', size: 21, players: 3, goals: 1 });
    const { room } = await a.waitFor('room:joined');
    for (const [client, name] of [[b, 'B'], [c, 'C']]) { client.send({ type: 'room:join', code: room.code, name }); await client.waitFor('room:joined'); }
    await a.waitFor('room:host');
    c.send({ type: 'room:leave' });
    await c.waitFor('room:left');
    const state = await b.waitFor('room:state', m => m.room.members.length === 2);
    assert.equal(state.room.phase, 'preparing');
    a.send({ type: 'maze:publish', maze: makeMaze(1, 21) });
    const [sa, sb] = await Promise.all([a.waitFor('game:start'), b.waitFor('game:start')]);
    assert.equal(sa.players.length, 2);
    assert.deepEqual(sb.players.map(p => p.id).sort(), [a.id, b.id].sort());
    await c.expectNone('game:start');
}));

test('the host leaving during preparation hands the maze job to the next member', () => withServer(async srv => {
    const [a, b, c] = [await srv.client(), await srv.client(), await srv.client()];
    a.send({ type: 'room:create', size: 21, players: 3, goals: 1, name: 'A' });
    const { room } = await a.waitFor('room:joined');
    for (const [client, name] of [[b, 'B'], [c, 'C']]) { client.send({ type: 'room:join', code: room.code, name }); await client.waitFor('room:joined'); }
    await a.waitFor('room:host');
    a.send({ type: 'room:leave' });
    await a.waitFor('room:left');
    const job = await b.waitFor('room:host');
    assert.equal(job.roomId, room.id);
    await c.expectNone('room:host');
    // A's stale answer, if it ever arrived, would be ignored
    a.send({ type: 'maze:publish', maze: makeMaze(1, 21) });
    assert.equal((await a.waitFor('room:error')).code, 'stale');
    b.send({ type: 'maze:publish', maze: makeMaze(1, 21) });
    const [sb, sc] = await Promise.all([b.waitFor('game:start'), c.waitFor('game:start')]);
    assert.equal(sb.players.length, 2);
    assert.equal(sc.players.length, 2);
}));

test('dropping below two racers during preparation reopens the room with a notice', () => withServer(async srv => {
    const watcher = await srv.client();
    watcher.send({ type: 'lobby:watch' });
    await watcher.waitFor('lobby:state');
    const [a, b] = [await srv.client(), await srv.client()];
    a.send({ type: 'room:create', size: 21, players: 2, goals: 1, name: 'A' });
    const { room } = await a.waitFor('room:joined');
    b.send({ type: 'room:join', code: room.code, name: 'B' });
    await b.waitFor('room:joined');
    await a.waitFor('room:host');
    b.ws.terminate();
    const reopened = await a.waitFor('room:state', m => m.room.phase === 'waiting' && m.room.members.length === 1);
    assert.equal(reopened.room.hostId, a.id);
    const notice = await a.waitFor('room:notice');
    assert.equal(notice.roomId, room.id);
    assert.ok(notice.message.length > 5);
    // the host's late maze is ignored, and the room is joinable again
    a.send({ type: 'maze:publish', maze: makeMaze(1, 21) });
    assert.equal((await a.waitFor('room:error')).code, 'stale');
    const patch = await watcher.waitFor('lobby:patch', m => { const s = summaryOf(m, room.id); return s && s.phase === 'waiting' && s.count === 1; });
    assert.equal(patch.counts.waitingRooms, 1);
    const c = await srv.client();
    c.send({ type: 'room:join', code: room.code, name: 'C' });
    await c.waitFor('room:joined');
    await a.waitFor('room:host');
}));

test('a host who never publishes is replaced after the prepare timeout', () => withServer(async srv => {
    const [a, b, c] = [await srv.client(), await srv.client(), await srv.client()];
    a.send({ type: 'room:create', size: 21, players: 3, goals: 1, name: 'Slow' });
    const { room } = await a.waitFor('room:joined');
    for (const [client, name] of [[b, 'B'], [c, 'C']]) { client.send({ type: 'room:join', code: room.code, name }); await client.waitFor('room:joined'); }
    await a.waitFor('room:host');
    const started = Date.now();
    const removed = await a.waitFor('room:closed', () => true, 3000);
    assert.equal(removed.reason, 'host-timeout');
    assert.ok(Date.now() - started >= 600, 'not before the timeout');
    const job = await b.waitFor('room:host', () => true, 1500);
    assert.equal(job.roomId, room.id);
    b.send({ type: 'maze:publish', maze: makeMaze(1, 21) });
    const [sb, sc] = await Promise.all([b.waitFor('game:start'), c.waitFor('game:start')]);
    assert.equal(sb.players.length, 2);
    assert.equal(sc.players.length, 2);
    await a.expectNone('game:start');
}));

test('a lone remaining member after a host timeout gets an open room back', () => withServer(async srv => {
    const [a, b] = [await srv.client(), await srv.client()];
    a.send({ type: 'room:create', size: 21, players: 2, goals: 1, name: 'Slow' });
    const { room } = await a.waitFor('room:joined');
    b.send({ type: 'room:join', code: room.code, name: 'B' });
    await b.waitFor('room:joined');
    await a.waitFor('room:closed', () => true, 3000);
    const state = await b.waitFor('room:state', m => m.room.phase === 'waiting' && m.room.hostId === b.id);
    assert.equal(state.room.members.length, 1);
    await b.waitFor('room:notice');
    assert.equal((await srv.json('/rooms')).rooms[0].phase, 'waiting');
}));

test('a waiting room that nobody fills expires', () => withServer({ MAZE_WAITING_TTL_MS: '350' }, async srv => {
    const a = await srv.client();
    const watcher = await srv.client();
    watcher.send({ type: 'lobby:watch' });
    await watcher.waitFor('lobby:state');
    a.send({ type: 'room:create', size: 21, players: 5, goals: 1 });
    const { room } = await a.waitFor('room:joined');
    const closed = await a.waitFor('room:closed', () => true, 3000);
    assert.equal(closed.reason, 'expired');
    await watcher.waitFor('lobby:patch', m => (m.remove || []).includes(room.id));
    a.send({ type: 'room:create', size: 21, players: 2, goals: 1 }); // and the creator is free again
    await a.waitFor('room:joined');
}));

test('disconnects clean up rooms and counts', () => withServer(async srv => {
    const watcher = await srv.client();
    watcher.send({ type: 'lobby:watch' });
    await watcher.waitFor('lobby:state');
    const [a, b] = [await srv.client(), await srv.client()];
    a.send({ type: 'room:create', size: 33, players: 4, goals: 3, name: 'A' });
    const { room } = await a.waitFor('room:joined');
    b.send({ type: 'room:join', code: room.code });
    await b.waitFor('room:joined');
    await watcher.waitFor('lobby:patch', m => m.counts.waitingPlayers === 2 && m.counts.onlinePlayers === 3);
    a.ws.terminate();
    b.ws.terminate();
    const patch = await watcher.waitFor('lobby:patch', m => (m.remove || []).includes(room.id));
    assert.equal(patch.counts.waitingRooms, 0);
    const health = await eventually(async () => { const h = await srv.json('/health'); return h.onlinePlayers === 1 && h; });
    assert.equal(health.activeRooms, 0);
    assert.deepEqual((await srv.json('/rooms')).counts.waitingByMode, {});
}));

/* ── Spectators ────────────────────────────────────────────────────────── */
test('spectating: full start payload, coalesced updates, the result, and leaving', () => withServer(async srv => {
    const race = await startRace(srv, 2, { goals: 1 });
    const [a, b] = race.clients;
    const spectator = await srv.client();
    const watcher = await srv.client();
    watcher.send({ type: 'lobby:watch' });
    const state = await watcher.waitFor('lobby:state');
    assert.equal(state.rooms.find(r => r.id === race.room.id).phase, 'playing');
    assert.equal(state.rooms.find(r => r.id === race.room.id).spectators, 0);

    spectator.send({ type: 'spectate:join', roomId: race.room.id });
    const start = await spectator.waitFor('spectate:start');
    assert.equal(start.roomId, race.room.id);
    assert.equal(start.code, race.room.code);
    assert.equal(start.maze.maze, race.maze.maze);
    assert.deepEqual(start.maze.exits, race.maze.exits);
    assert.equal(start.goalCount, 1);
    assert.equal(start.spectators, 1);
    assert.equal(start.players.length, 2);
    assert.equal(start.players[0].position, race.maze.start);
    await watcher.waitFor('lobby:patch', m => { const s = summaryOf(m, race.room.id); return s && s.spectators === 1; });

    // a move reaches the spectator as a snapshot, with no per-move event
    const mask = parseInt(race.maze.maze[race.maze.start], 16);
    const open = [0, 1, 2, 3].find(d => mask & (1 << d));
    spectator.inbox.length = 0;
    a.send({ type: 'player:move', direction: open });
    const snapshot = await spectator.waitFor('room:update', m => m.players.find(p => p.id === a.id).steps === 1, 1500);
    assert.equal(snapshot.lastMove, null);
    assert.equal(snapshot.players.find(p => p.id === a.id).position, race.maze.start + STEP(21, open));
    assert.equal(snapshot.spectators, 1);
    const playerUpdate = await a.waitFor('room:update', m => m.lastMove && m.lastMove.id === a.id);
    assert.equal(playerUpdate.spectators, 1, 'racers learn how many people watch with their next update');

    // spectators can't move anybody
    spectator.send({ type: 'player:move', direction: open });
    await spectator.expectNone('player:blocked');
    await b.expectNone('room:update', m => m.players.find(p => p.id === b.id).steps > 0, 200);

    // finish → game:finish reaches the spectator
    await walk(a, race.maze, 21, race.maze.start + STEP(21, open), race.maze.exits[0]);
    const finish = await spectator.waitFor('game:finish');
    assert.equal(finish.winnerId, a.id);
    assert.equal(finish.players.length, 2);

    spectator.send({ type: 'spectate:leave' });
    assert.equal((await spectator.waitFor('spectate:left')).roomId, race.room.id);
}));

test('spectating is refused for waiting rooms, unknown rooms and by racers; leaving updates the count', () => withServer(async srv => {
    const [host, guest, spectator] = [await srv.client(), await srv.client(), await srv.client()];
    host.send({ type: 'room:create', size: 21, players: 3, goals: 1 });
    const { room } = await host.waitFor('room:joined');
    spectator.send({ type: 'spectate:join', roomId: room.id });
    assert.equal((await spectator.waitFor('room:error')).code, 'not-live');
    spectator.send({ type: 'spectate:join', code: 'NOPE' });
    assert.equal((await spectator.waitFor('room:error')).code, 'not-found');
    host.send({ type: 'spectate:join', roomId: room.id });
    assert.equal((await host.waitFor('room:error')).code, 'busy', 'a seated racer cannot spectate');

    const race = await startRace(srv, 2, { goals: 1 });
    race.clients[0].send({ type: 'spectate:join', roomId: race.room.id });
    assert.equal((await race.clients[0].waitFor('room:error')).code, 'busy');
    const watcher = await srv.client();
    watcher.send({ type: 'lobby:watch' });
    await watcher.waitFor('lobby:state');
    spectator.send({ type: 'spectate:join', roomId: race.room.id });
    await spectator.waitFor('spectate:start');
    await watcher.waitFor('lobby:patch', m => { const s = summaryOf(m, race.room.id); return s && s.spectators === 1; });

    // sitting down in a waiting room stops the watching
    spectator.send({ type: 'room:join', roomId: room.id, name: 'Was watching' });
    await spectator.waitFor('room:joined');
    await watcher.waitFor('lobby:patch', m => { const s = summaryOf(m, race.room.id); return s && s.spectators === 0; });

    // disconnecting also stops it
    guest.send({ type: 'lobby:watch' });
    guest.send({ type: 'spectate:join', roomId: race.room.id });
    await guest.waitFor('spectate:start');
    await watcher.waitFor('lobby:patch', m => { const s = summaryOf(m, race.room.id); return s && s.spectators === 1; });
    guest.ws.terminate();
    await watcher.waitFor('lobby:patch', m => { const s = summaryOf(m, race.room.id); return s && s.spectators === 0; });
}));

test('when every racer leaves, spectators are told the game ended', () => withServer(async srv => {
    const race = await startRace(srv, 2, { goals: 1 });
    const spectator = await srv.client();
    spectator.send({ type: 'spectate:join', roomId: race.room.id });
    await spectator.waitFor('spectate:start');
    race.clients[0].send({ type: 'room:leave' });
    await race.clients[0].waitFor('room:left');
    race.clients[1].ws.terminate();
    const ended = await spectator.waitFor('spectate:ended');
    assert.equal(ended.reason, 'abandoned');
    await eventually(async () => (await srv.json('/health')).activeRooms === 0);
    // a spectator can watch again afterwards
    spectator.send({ type: 'spectate:join', roomId: race.room.id });
    assert.equal((await spectator.waitFor('room:error')).code, 'not-found');
}));

/* ── Peeks ─────────────────────────────────────────────────────────────── */
test('lobby:peek streams the maze once and then position frames', () => withServer(async srv => {
    const race = await startRace(srv, 3, { goals: 1 });
    const [a, b, c] = race.clients;
    const watcher = await srv.client();
    watcher.send({ type: 'lobby:peek', ids: [race.room.id] }); // not watching yet: ignored
    await watcher.expectNone('peek:maze', () => true, 200);
    watcher.send({ type: 'lobby:watch' });
    await watcher.waitFor('lobby:state');
    watcher.send({ type: 'lobby:peek', ids: [race.room.id, 'no-such-room', 42, null] });
    const maze = await watcher.waitFor('peek:maze');
    assert.equal(maze.roomId, race.room.id);
    assert.equal(maze.size, 21);
    assert.equal(maze.maze, race.maze.maze);
    assert.equal(maze.start, race.maze.start);
    assert.deepEqual(maze.exits, race.maze.exits);
    assert.equal(maze.colors.length, 3);
    assert.equal(maze.goals, 1);
    const first = await watcher.waitFor('peek:frame');
    assert.deepEqual(first.pos, [race.maze.start, race.maze.start, race.maze.start]);
    assert.deepEqual(first.goals, [0, 0, 0]);
    assert.equal(watcher.all('peek:maze').length, 1);

    // a move appears in a later frame (frames are throttled to ~4 Hz)
    const mask = parseInt(race.maze.maze[race.maze.start], 16);
    const open = [0, 1, 2, 3].find(d => mask & (1 << d));
    a.send({ type: 'player:move', direction: open });
    const moved = await watcher.waitFor('peek:frame', m => m.pos[0] !== race.maze.start, 2000);
    assert.equal(moved.pos[0], race.maze.start + STEP(21, open));
    assert.equal(moved.pos[1], race.maze.start);

    // a racer who left shows as -1, aligned with the original order
    b.send({ type: 'room:leave' });
    await b.waitFor('room:left');
    const left = await watcher.waitFor('peek:frame', m => m.pos[1] === -1, 2000);
    assert.equal(left.pos.length, 3);
    assert.equal(left.pos[0], moved.pos[0]);

    // re-sending the same ids costs nothing; an empty list stops the stream
    watcher.send({ type: 'lobby:peek', ids: [race.room.id] });
    await sleep(120);
    assert.equal(watcher.all('peek:maze').length, 1);
    watcher.send({ type: 'lobby:peek', ids: [] });
    await sleep(80);
    watcher.inbox.length = 0;
    c.send({ type: 'player:move', direction: open });
    await watcher.expectNone('peek:frame', () => true, 600);

    // peeking again, then finishing: peek:end
    watcher.send({ type: 'lobby:peek', ids: [race.room.id] });
    await watcher.waitFor('peek:maze');
    await walk(a, race.maze, 21, moved.pos[0], race.maze.exits[0]);
    const end = await watcher.waitFor('peek:end');
    assert.equal(end.roomId, race.room.id);
    assert.equal(end.reason, 'finished');
}));

test('peeks cover running games only and at most 12 rooms at once', () => withServer(async srv => {
    const watcher = await srv.client();
    watcher.send({ type: 'lobby:watch' });
    await watcher.waitFor('lobby:state');
    const waiting = await srv.client();
    waiting.send({ type: 'room:create', size: 21, players: 4, goals: 1 });
    const { room: waitingRoom } = await waiting.waitFor('room:joined');
    const ids = [];
    for (let i = 0; i < 14; i++) ids.push((await startRace(srv, 2, { goals: 1 })).room.id);
    watcher.send({ type: 'lobby:peek', ids: [waitingRoom.id, ...ids] });
    await eventually(() => watcher.all('peek:maze').length >= 12);
    await sleep(200);
    assert.equal(watcher.all('peek:maze').length, 12, 'a waiting room is not peekable and the 12-room cap holds');
    assert.ok(!watcher.all('peek:maze').some(m => m.roomId === waitingRoom.id));
    // closing a peeked room ends its peek
    const peeked = watcher.all('peek:maze')[0].roomId;
    const owner = srv.clients.find(c => c.history.some(m => m.type === 'game:start' && m.roomId === peeked));
    owner.ws.terminate();
    const other = srv.clients.find(c => c !== owner && c.history.some(m => m.type === 'game:start' && m.roomId === peeked));
    other.ws.terminate();
    const end = await watcher.waitFor('peek:end', m => m.roomId === peeked);
    assert.equal(end.reason, 'abandoned');
}));

/* ── Protocol v1 clients ───────────────────────────────────────────────── */
test('legacy queue:join still pairs two players and runs a race', () => withServer(async srv => {
    const [a, b] = [await srv.client(), await srv.client()];
    a.send({ type: 'queue:join', size: 21, players: 2, goals: 1, name: 'Old A' });
    const waiting = await a.waitFor('queue:waiting');
    assert.deepEqual([waiting.waitingPlayers, waiting.requiredPlayers, waiting.size, waiting.goals], [1, 2, 21, 1]);
    b.send({ type: 'queue:join', size: 21, players: 2, goals: 1, name: 'Old B' });
    const full = await a.waitFor('queue:waiting', m => m.waitingPlayers === 2);
    assert.equal(full.requiredPlayers, 2);
    const forming = await b.waitFor('room:forming');
    assert.deepEqual([forming.players, forming.goals, forming.size], [2, 1, 21]);
    const host = await a.waitFor('room:host');
    assert.deepEqual([host.goals, host.size], [1, 21]);
    await b.expectNone('room:host');
    a.send({ type: 'maze:publish', maze: makeMaze(1, 21) });
    const [sa, sb] = await Promise.all([a.waitFor('game:start'), b.waitFor('game:start')]);
    assert.equal(sa.ownPlayerId, a.id);
    assert.equal(sb.players.length, 2);
}));

test('legacy queue:leave leaves the room and answers queue:left', () => withServer(async srv => {
    const a = await srv.client();
    a.send({ type: 'queue:join', size: 21, players: 3, goals: 1 });
    await a.waitFor('queue:waiting');
    a.send({ type: 'queue:leave' });
    await a.waitFor('queue:left');
    await a.waitFor('room:left');
    await eventually(async () => (await srv.json('/health')).activeRooms === 0);
}));

/* ── Hygiene ───────────────────────────────────────────────────────────── */
test('names are sanitised and room codes are unique', () => withServer(async srv => {
    const clients = await Promise.all(Array.from({ length: 30 }, () => srv.client()));
    const codes = new Set();
    for (const [i, client] of clients.entries()) {
        client.send({ type: 'room:create', size: 21, players: 2, goals: 1, name: i === 0 ? '  <b>Evil</b>\u0007Name that is far too long to keep  ' : '' });
        const { room } = await client.waitFor('room:joined');
        codes.add(room.code);
        if (i === 0) {
            assert.ok(room.members[0].name.length <= 24);
            assert.ok(!/[<>\u0007]/.test(room.members[0].name));
        } else {
            assert.equal(room.members[0].name, 'Player');
        }
    }
    assert.equal(codes.size, 30);
    assert.equal((await srv.json('/rooms')).rooms.length, 30);
}));

test('closing every socket leaves no rooms behind', () => withServer(async srv => {
    const race1 = await startRace(srv, 3, { goals: 1 });
    const race2 = await startRace(srv, 2, { goals: 1 });
    const spectator = await srv.client();
    spectator.send({ type: 'lobby:watch' });
    await spectator.waitFor('lobby:state');
    spectator.send({ type: 'lobby:peek', ids: [race1.room.id, race2.room.id] });
    await spectator.waitFor('peek:maze');
    const waiting = await srv.client();
    waiting.send({ type: 'room:quick', size: 33, players: 6, goals: 3 });
    await waiting.waitFor('room:joined');
    for (const c of srv.clients) c.ws.terminate();
    const health = await eventually(async () => { const h = await srv.json('/health'); return h.onlinePlayers === 0 && h; });
    assert.equal(health.activeRooms, 0);
    assert.equal(health.waitingRooms, 0);
    assert.equal(health.liveRooms, 0);
    assert.equal(health.spectators, 0);
    const lobby = await srv.json('/rooms');
    assert.deepEqual(lobby.rooms, []);
}));

test('the heartbeat drops connections that stop answering pings and keeps healthy ones', () => withServer({ MAZE_HEARTBEAT_MS: '150' }, async srv => {
    const healthy = await srv.client();
    const frozen = await new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${srv.port}`, { autoPong: false });
        const client = new Client(ws);
        srv.clients.push(client);
        ws.once('error', reject);
        client.waitFor('connected').then(() => resolve(client), reject);
    });
    frozen.send({ type: 'room:create', size: 21, players: 4, goals: 1 });
    await frozen.waitFor('room:joined');
    await eventually(() => frozen.closed, 2000);
    assert.ok(!healthy.closed, 'a client that answers pings stays connected');
    await eventually(async () => { const h = await srv.json('/health'); return h.activeRooms === 0 && h.onlinePlayers === 1; });
}));
