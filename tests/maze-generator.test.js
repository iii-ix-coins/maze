import test from 'node:test';
import assert from 'node:assert/strict';
import { generateMazeData, SIZE, N, bfs, NB } from '../maze-game/core/maze-generator.js';

function assertValidMaze({ open, startCell, exits }, expectedGoals) {
    assert.equal(open.length, N, 'maze should have exactly SIZE × SIZE cells');
    assert.equal(exits.length, expectedGoals, 'the selected mode should generate the expected number of targets');
    assert.equal(new Set([startCell, ...exits]).size, expectedGoals + 1, 'start and targets should be unique');
    assert.ok(startCell >= 0 && startCell < N, 'start cell should be in the maze');

    const distances = new Int32Array(N);
    bfs(open, startCell, distances, null);
    assert.ok([...distances].every(distance => distance >= 0), 'all cells should be reachable from the start');
    assert.ok(exits.every(cell => distances[cell] > 0), 'all targets should be reachable and distinct from the start');

    for (let cell = 0; cell < N; cell++) {
        const row = Math.floor(cell / SIZE);
        const col = cell % SIZE;
        for (let direction = 0; direction < 4; direction++) {
            if (!(open[cell] & (1 << direction))) continue;
            const nr = row + [-1, 0, 1, 0][direction];
            const nc = col + [0, 1, 0, -1][direction];
            assert.ok(nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE, 'passages must not leave the grid');
            const next = NB[cell * 4 + direction];
            assert.ok(next >= 0, 'passage endpoint should be valid');
            assert.ok(open[next] & (1 << ((direction + 2) % 4)), 'each passage should be reciprocal');
        }
    }
}

for (const goals of [3, 6, 9]) {
    test(`${goals}-target maze is valid for ordered collection`, () => {
        const maze = generateMazeData(goals);
        assertValidMaze(maze, goals);

        // Matchmaking sends a compact hexadecimal wall-mask string to the WebSocket server.
        const serializedMaze = Array.from(maze.open, value => value.toString(16)).join('');
        assert.equal(serializedMaze.length, N, 'serialized server map should contain one hex digit per cell');
        assert.match(serializedMaze, /^[0-9a-f]+$/i, 'server map should use hexadecimal wall masks');
        assert.equal(maze.exits.length, goals, 'serialized race mode should preserve selected goal count');

        // Ordered targets must form a fully traversable route, independent of free-order optimizers.
        const routeDistances = new Int32Array(N);
        let source = maze.startCell;
        let routeLength = 0;
        for (const target of maze.exits) {
            bfs(maze.open, source, routeDistances, null);
            assert.ok(routeDistances[target] > 0, 'each next target should require a valid route');
            routeLength += routeDistances[target];
            source = target;
        }
        assert.ok(Number.isFinite(routeLength) && routeLength > 0, 'ordered route length should be finite');
    });
}
