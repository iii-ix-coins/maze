// Added in v4 (not in the legacy suite): pins the constants that used to be written twice, once in the client and once
// in the server, with a "must match" comment. They now live in @maze/shared, so this is the single place to check them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAZE_SIZES, MIN_GOALS, MAX_GOALS, MAX_PLAYERS, DIFFICULTIES } from '@maze/shared';

test('shared limits keep the exact values of the legacy client and server', () => {
    assert.deepEqual([...MAZE_SIZES], [21, 33, 45]);
    assert.equal(MIN_GOALS, 1);
    assert.equal(MAX_GOALS, 99);
    assert.equal(MAX_PLAYERS, 99);
    assert.deepEqual(DIFFICULTIES.map(d => d.size), [21, 33, 45]);
});
