import test from 'node:test';
import assert from 'node:assert/strict';
import { RaceBoardComponent, raceBoardStore } from '../../../src/features/maze/ui/race-board';

test('Race Board keeps the current racer visible below the row limit', () => {
    const board = new RaceBoardComponent();
    const players = Array.from({ length: 12 }, (_, index) => ({
        id: `player-${index + 1}`,
        name: `Player ${index + 1}`,
        goals: 0,
        steps: index + 1,
        finished: false,
    }));

    board.render(players, 'player-12', 3);

    const snapshot = raceBoardStore.getSnapshot();
    assert.equal(snapshot.visible, true);
    assert.equal(snapshot.rows.length, 8);
    assert.equal(snapshot.rows.at(-1)?.id, 'player-12');
    assert.equal(snapshot.hiddenCount, 4);
    assert.equal(snapshot.picking, false);
});

test('spectator rows are selectable and the selection delegates to the original callback', () => {
    let selected = '';
    const board = new RaceBoardComponent({ onPick: id => { selected = id; } });
    board.render([
        { id: 'leader', name: 'Leader', goals: 2, steps: 10 },
        { id: 'follower', name: 'Follower', goals: 1, steps: 15 },
    ], '', 3, 'leader');

    assert.equal(raceBoardStore.getSnapshot().picking, true);
    raceBoardStore.select('follower');
    assert.equal(selected, 'follower');
});

test('hiding the Race Board changes only view state', () => {
    const board = new RaceBoardComponent();
    board.render([{ id: 'a', goals: 0, steps: 1 }], 'a', 3);
    board.hide();

    assert.equal(raceBoardStore.getSnapshot().visible, false);
    assert.equal(raceBoardStore.getSnapshot().rows[0]?.id, 'a');
});
