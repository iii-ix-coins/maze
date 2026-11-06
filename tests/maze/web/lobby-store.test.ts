import test from 'node:test';
import assert from 'node:assert/strict';
import { LobbyStore } from '../../../src/features/maze/ui/lobby/lobby-store';

const r = (id, over = {}) => ({ id, code: id.toUpperCase().padEnd(4, 'X'), phase: 'waiting', size: 21, goals: 3, capacity: 4, count: 1, host: 'H', createdAt: 1, spectators: 0, seats: [0], names: ['H'], ...over });

test('a snapshot fills the store and reports what arrived', () => {
    const store = new LobbyStore();
    const seen = [];
    store.subscribe(change => seen.push(change));
    assert.equal(store.ready, false);
    store.applyState({ serverTime: Date.now() + 5000, rooms: [r('a'), r('b', { phase: 'playing', leader: null })], recent: [{ id: 'z', finishedAt: Date.now() }], counts: { onlinePlayers: 7 } });
    assert.equal(store.ready, true);
    assert.deepEqual(store.waiting().map(x => x.id), ['a']);
    assert.deepEqual(store.live().map(x => x.id), ['b']);
    assert.equal(store.counts.onlinePlayers, 7);
    assert.equal(store.counts.waitingRooms, 0, 'missing counts fall back to zero');
    assert.deepEqual(seen[0].added.sort(), ['a', 'b']);
    assert.ok(Math.abs(store.clockOffset - 5000) < 200, 'the server clock offset is learned');
    assert.ok(Math.abs(store.now() - (Date.now() + 5000)) < 200);
});

test('patches upsert, remove and keep unrelated rooms untouched', () => {
    const store = new LobbyStore();
    store.applyState({ rooms: [r('a'), r('b')], counts: {} });
    const seen = [];
    store.subscribe(change => seen.push(change));
    store.applyPatch({ upsert: [r('a', { count: 2, seats: [0, 1] }), r('c')], remove: ['b'], counts: { waitingRooms: 2 } });
    assert.deepEqual(seen[0], { full: false, added: ['c'], updated: ['a'], removed: ['b'] });
    assert.equal(store.get('a').count, 2);
    assert.equal(store.get('b'), null);
    assert.equal(store.counts.waitingRooms, 2);
    store.applyPatch({ remove: ['nope'] });
    assert.deepEqual(seen[1].removed, [], 'removing an unknown room is not a change');
});

test('a second snapshot diffs against the first', () => {
    const store = new LobbyStore();
    store.applyState({ rooms: [r('a'), r('b')], counts: {} });
    const seen = [];
    store.subscribe(change => seen.push(change));
    store.applyState({ rooms: [r('a'), r('b', { count: 3 }), r('c')], counts: {} });
    assert.deepEqual([seen[0].added, seen[0].updated, seen[0].removed], [['c'], ['b'], []]);
    store.applyState({ rooms: [r('c')], counts: {} });
    assert.deepEqual(seen[1].removed.sort(), ['a', 'b']);
});

test('patches before the first snapshot are ignored, reset forgets everything', () => {
    const store = new LobbyStore();
    store.applyPatch({ upsert: [r('a')], remove: [], counts: { onlinePlayers: 3 } });
    assert.equal(store.rooms.size, 0);
    store.applyState({ rooms: [r('a')], counts: { onlinePlayers: 3 } });
    let last;
    store.subscribe(change => { last = change; });
    store.reset();
    assert.equal(store.ready, false);
    assert.equal(store.rooms.size, 0);
    assert.equal(store.counts.onlinePlayers, 0);
    assert.deepEqual(last.removed, ['a']);
});

test('rooms are found by code and recent races age out', () => {
    const store = new LobbyStore();
    const now = Date.now();
    store.applyState({
        rooms: [r('k7qf', { code: 'K7QF' })],
        recent: [{ id: 'new', finishedAt: now - 1000 }, { id: 'old', finishedAt: now - 120_000 }],
        counts: {}
    });
    assert.equal(store.findByCode('k7qf').id, 'k7qf');
    assert.equal(store.findByCode('nope'), null);
    assert.deepEqual(store.recentRaces().map(x => x.id), ['new']);
});

test('a throwing listener never blocks the others', () => {
    const store = new LobbyStore();
    const originalError = console.error;
    console.error = () => {};
    let reached = false;
    store.subscribe(() => { throw new Error('boom'); });
    store.subscribe(() => { reached = true; });
    store.applyState({ rooms: [], counts: {} });
    console.error = originalError;
    assert.equal(reached, true);
});
