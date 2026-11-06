import test from 'node:test';
import assert from 'node:assert/strict';
import { rankPlayers } from '../../../src/features/maze/ui/race-board';

test('rankPlayers puts finished racers first, then most targets, then fewest steps', () => {
    const ranked = rankPlayers([
        { id: 'a', goals: 2, steps: 40, finished: false },
        { id: 'b', goals: 3, steps: 90, finished: true },
        { id: 'c', goals: 2, steps: 25, finished: false },
        { id: 'd', goals: 0, steps: 0, finished: false }
    ]).map(p => p.id);
    assert.deepEqual(ranked, ['b', 'c', 'a', 'd']);
});

test('rankPlayers does not change the list it is given', () => {
    const input = [{ id: 'x', goals: 0, steps: 5 }, { id: 'y', goals: 1, steps: 9 }];
    rankPlayers(input);
    assert.deepEqual(input.map(p => p.id), ['x', 'y']);
});
