import test from 'node:test';
import assert from 'node:assert/strict';
import {
    seatLayout, levelOf, formatClock, formatAge, seatsLeft, fillRatio, liveProgress, roomHeat,
    filterRooms, sortWaiting, sortLive, sameRoom, cleanCode
} from '../../../src/features/maze/ui/lobby/lobby-model';

const room = (over = {}) => ({
    id: 'r' + Math.random().toString(36).slice(2), code: 'ABCD', phase: 'waiting', size: 33, goals: 5,
    capacity: 6, count: 2, host: 'Sara', createdAt: 1000, spectators: 0, seats: [0, 1], names: ['Sara', 'Ali'], ...over
});

test('seat layout gives every seat its own spot for every capacity from 1 to 99', () => {
    for (let n = 1; n <= 99; n++) {
        const { points, radius } = seatLayout(n);
        assert.equal(points.length, n);
        assert.ok(radius > 0 && radius <= 0.3, `radius for ${n}`);
        for (const p of points) assert.ok(Math.hypot(p.x, p.y) + radius <= 1.0001, `seat inside the disc for ${n}`);
        let min = Infinity;
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
            min = Math.min(min, Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y));
        }
        if (n > 1) assert.ok(min >= radius * 2 * 0.98, `seats overlap for ${n}: gap ${min.toFixed(3)} < ${(radius * 2).toFixed(3)}`);
    }
});

test('small rooms form a ring from the top; big rooms bloom from the centre', () => {
    const ring = seatLayout(4).points;
    assert.ok(Math.abs(ring[0].x) < 1e-9 && ring[0].y < 0, 'seat 0 sits at the top');
    assert.ok(ring[1].x > 0, 'the ring fills clockwise');
    const bloom = seatLayout(60).points;
    assert.ok(Math.hypot(bloom[0].x, bloom[0].y) < 0.15, 'seat 0 is near the middle');
    assert.ok(Math.hypot(bloom[59].x, bloom[59].y) > 0.8, 'the last seat is on the rim');
});

test('levels, clocks and ages read naturally', () => {
    assert.deepEqual([21, 33, 45].map(s => levelOf(s).label), ['Easy', 'Medium', 'Hard']);
    assert.equal(levelOf(21).index, 0);
    assert.equal(formatClock(0), '0:00');
    assert.equal(formatClock(72_000), '1:12');
    assert.equal(formatClock(3_725_000), '1:02:05');
    assert.equal(formatClock(-5), '0:00');
    assert.equal(formatAge(3000), 'just now');
    assert.equal(formatAge(42_000), '42s');
    assert.equal(formatAge(3 * 60_000), '3 min');
    assert.equal(formatAge(65 * 60_000), '1 h 05 min');
});

test('seat arithmetic and heat', () => {
    assert.equal(seatsLeft(room({ capacity: 6, count: 2 })), 4);
    assert.equal(seatsLeft(room({ capacity: 2, count: 5 })), 0);
    assert.equal(fillRatio(room({ capacity: 4, count: 1 })), 0.25);
    assert.equal(roomHeat(room({ capacity: 6, count: 1 })), 'fresh');
    assert.equal(roomHeat(room({ capacity: 6, count: 3 })), 'warm');
    assert.equal(roomHeat(room({ capacity: 6, count: 5 })), 'hot');
    assert.equal(liveProgress({ goals: 4, leader: { goals: 1 } }), 0.25);
    assert.equal(liveProgress({ goals: 4, leader: null }), 0);
});

test('filters match size, text and openness', () => {
    const list = [
        room({ id: 'a', size: 21, code: 'K7QF', host: 'Nasim' }),
        room({ id: 'b', size: 45, code: 'ZZ22', host: 'Ali', names: ['Ali', 'Mina'] }),
        room({ id: 'c', size: 45, code: 'QQ99', host: 'Reza', phase: 'preparing', count: 6 })
    ];
    assert.deepEqual(filterRooms(list, {}).map(r => r.id), ['a', 'b', 'c']);
    assert.deepEqual(filterRooms(list, { sizes: new Set([45]) }).map(r => r.id), ['b', 'c']);
    assert.deepEqual(filterRooms(list, { query: ' k7q ' }).map(r => r.id), ['a']);
    assert.deepEqual(filterRooms(list, { query: 'mina' }).map(r => r.id), ['b']);
    assert.deepEqual(filterRooms(list, { openOnly: true }).map(r => r.id), ['a', 'b']);
    assert.deepEqual(filterRooms(list, { sizes: new Set(), query: '' }).length, 3);
});

test('waiting rooms: nearly-full first, rooms that are starting last', () => {
    const list = [
        room({ id: 'old-empty', capacity: 6, count: 1, createdAt: 1 }),
        room({ id: 'almost', capacity: 6, count: 5, createdAt: 50 }),
        room({ id: 'starting', capacity: 2, count: 2, phase: 'preparing', createdAt: 10 }),
        room({ id: 'half', capacity: 6, count: 3, createdAt: 20 })
    ];
    assert.deepEqual(sortWaiting(list, 'fill').map(r => r.id), ['almost', 'half', 'old-empty', 'starting']);
    assert.deepEqual(sortWaiting(list, 'newest').map(r => r.id), ['almost', 'half', 'old-empty', 'starting']);
    assert.deepEqual(sortWaiting(list, 'biggest')[3].id, 'starting');
    assert.equal(list[0].id, 'old-empty', 'the input array is not mutated');
});

test('live games sort by closeness, crowd, audience and recency', () => {
    const live = (id, goals, leaderGoals, count, spectators, startedAt) =>
        ({ id, phase: 'playing', goals, count, spectators, startedAt, leader: { name: 'x', goals: leaderGoals } });
    const list = [live('a', 10, 2, 40, 0, 100), live('b', 10, 9, 3, 5, 300), live('c', 10, 5, 99, 50, 200)];
    assert.deepEqual(sortLive(list, 'close').map(r => r.id), ['b', 'c', 'a']);
    assert.deepEqual(sortLive(list, 'crowd').map(r => r.id), ['c', 'a', 'b']);
    assert.deepEqual(sortLive(list, 'watched').map(r => r.id), ['c', 'b', 'a']);
    assert.deepEqual(sortLive(list, 'newest').map(r => r.id), ['b', 'c', 'a']);
});

test('sameRoom ignores fields a card never shows', () => {
    const a = room({ id: 'x' });
    assert.equal(sameRoom(a, { ...a }), true);
    assert.equal(sameRoom(a, { ...a, count: 3 }), false);
    assert.equal(sameRoom(a, { ...a, seats: [0, 2] }), false);
    assert.equal(sameRoom(a, { ...a, createdAt: 999 }), true);
});

test('typed room codes are cleaned to the server alphabet', () => {
    assert.equal(cleanCode(' k7-qf '), 'K7QF');
    assert.equal(cleanCode('abcd1234'), 'ABCD23', 'the digit 1 is not in the alphabet and six characters is the maximum');
    assert.equal(cleanCode('o0i1'), '');
    assert.equal(cleanCode('ABCDEFGHJK').length, 6);
});

test('seat colours match the server palette, including the golden-angle tail', async () => {
    const { readFile } = await import('node:fs/promises');
    const { seatColor, SEAT_PALETTE } = await import('../../../src/features/maze/ui/lobby/lobby-model');
    const source = await readFile(new URL('../../../engines/maze-server/src/config.ts', import.meta.url), 'utf8');
    const literal = source.match(/const PALETTE = \[([\s\S]*?)\];/)[1];
    const serverPalette = [...literal.matchAll(/'(#[0-9a-f]{6})'/gi)].map(m => m[1]);
    assert.deepEqual([...SEAT_PALETTE], serverPalette);
    // The tail uses the same formula as the server: hsl(round(i * 137.508 mod 360), 72%, 64%).
    for (const i of [10, 11, 37, 98]) assert.equal(seatColor(i), `hsl(${Math.round((i * 137.508) % 360)}, 72%, 64%)`);
    assert.equal(new Set(Array.from({ length: 99 }, (_, i) => seatColor(i))).size, 99, 'all 99 seats are distinguishable');
});

test('wall segments describe a maze border and its inner walls', async () => {
    const { wallSegments } = await import('../../../src/features/maze/ui/lobby/lobby-model');
    // 2×2 board, every wall closed: 2 horizontal + 2 vertical runs on each of 3 lines = 12 unit walls merged into 6 runs.
    const closed = wallSegments('0000', 2);
    assert.equal(closed.length / 4, 6);
    // Fully open board: only the outer border remains (4 runs).
    const openAll = wallSegments('6cc3'.replace(/./g, 'f'), 2);
    assert.equal(openAll.length / 4, 4);
    for (let i = 0; i < openAll.length; i += 4) {
        const [x1, y1, x2, y2] = openAll.slice(i, i + 4);
        assert.ok(x1 === x2 || y1 === y2, 'segments are axis aligned');
        assert.ok([x1, y1, x2, y2].every(v => v >= 0 && v <= 2));
    }
});
