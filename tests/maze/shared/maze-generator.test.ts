import test from 'node:test';
import assert from 'node:assert/strict';
import {
    generateMazeData, generatePreviewMaze, getGrid, bfs,
    DIFFICULTIES, MAZE_SIZES, MIN_GOALS, MAX_GOALS, DR, DC
} from '@maze/shared';

function assertValidMaze({ open, startCell, exits, size }, expectedSize, expectedGoals) {
    const grid = getGrid(expectedSize);
    const { SIZE, N, NB } = grid;
    assert.equal(size, expectedSize, 'the result should report the requested board size');
    assert.equal(open.length, N, 'maze should have exactly SIZE × SIZE cells');
    assert.equal(exits.length, expectedGoals, 'the selected mode should generate the expected number of targets');
    assert.equal(new Set([startCell, ...exits]).size, expectedGoals + 1, 'start and targets should be unique');
    assert.ok(startCell >= 0 && startCell < N, 'start cell should be in the maze');

    const distances = new Int32Array(N);
    bfs(grid, open, startCell, distances, null);
    assert.ok([...distances].every(distance => distance >= 0), 'all cells should be reachable from the start');
    assert.ok(exits.every(cell => distances[cell] > 0), 'all targets should be reachable and distinct from the start');

    for (let cell = 0; cell < N; cell++) {
        const row = Math.floor(cell / SIZE);
        const col = cell % SIZE;
        for (let direction = 0; direction < 4; direction++) {
            if (!(open[cell] & (1 << direction))) continue;
            const nr = row + DR[direction];
            const nc = col + DC[direction];
            assert.ok(nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE, 'passages must not leave the grid');
            const next = NB[cell * 4 + direction];
            assert.ok(next >= 0, 'passage endpoint should be valid');
            assert.ok(open[next] & (1 << ((direction + 2) % 4)), 'each passage should be reciprocal');
        }
    }
}

test('difficulty levels map to the 21 / 33 / 45 boards', () => {
    assert.deepEqual(DIFFICULTIES.map(d => [d.id, d.size]), [['easy', 21], ['medium', 33], ['hard', 45]]);
    assert.deepEqual([...MAZE_SIZES], [21, 33, 45]);
    assert.equal(MIN_GOALS, 1);
    assert.equal(MAX_GOALS, 99);
});

test('grids are cached per size and independent of each other', () => {
    assert.equal(getGrid(21), getGrid(21));
    assert.notEqual(getGrid(21), getGrid(33));
    assert.equal(getGrid(33).N, 33 * 33);
    assert.throws(() => getGrid(3), RangeError);
    assert.throws(() => getGrid('abc'), RangeError);
});

for (const { id, size } of DIFFICULTIES) {
    for (const goals of [1, 3, 9, 10, 40, 99]) {
        test(`${id} (${size}×${size}) with ${goals} target(s) is valid for ordered collection`, () => {
            const maze = generateMazeData(goals, size);
            assertValidMaze(maze, size, goals);

            // Matchmaking sends a compact hexadecimal wall-mask string to the WebSocket server.
            const serializedMaze = Array.from(maze.open, value => value.toString(16)).join('');
            assert.equal(serializedMaze.length, size * size, 'serialized server map should contain one hex digit per cell');
            assert.match(serializedMaze, /^[0-9a-f]+$/i, 'server map should use hexadecimal wall masks');

            // Ordered targets must form a fully traversable route, independent of free-order optimizers.
            const grid = getGrid(size);
            const routeDistances = new Int32Array(grid.N);
            let source = maze.startCell;
            let routeLength = 0;
            for (const target of maze.exits) {
                bfs(grid, maze.open, source, routeDistances, null);
                assert.ok(routeDistances[target] > 0, 'each next target should require a valid route');
                routeLength += routeDistances[target];
                source = target;
            }
            assert.ok(Number.isFinite(routeLength) && routeLength > 0, 'ordered route length should be finite');
        });
    }
}

test('many targets are chained as a tour, so the course stays playable', () => {
    const size = 33;
    const grid = getGrid(size);
    const maze = generateMazeData(60, size);
    const dist = new Int32Array(grid.N);
    let source = maze.startCell, total = 0;
    for (const target of maze.exits) {
        bfs(grid, maze.open, source, dist, null);
        total += dist[target];
        source = target;
    }
    const averageHop = total / maze.exits.length;
    assert.ok(averageHop < 40, `average hop between consecutive targets should be short, got ${averageHop.toFixed(1)}`);
});

test('out-of-range goal counts are clamped instead of failing', () => {
    assert.equal(generateMazeData(0, 21).exits.length, 3, 'a missing count falls back to the default');
    assert.equal(generateMazeData(-5, 21).exits.length, MIN_GOALS);
    assert.equal(generateMazeData(500, 21).exits.length, MAX_GOALS);
});

test('preview mazes carry the full ordered target pool for every board size', () => {
    for (const size of MAZE_SIZES) {
        const preview = generatePreviewMaze(size);
        assert.equal(preview.size, size);
        assert.equal(preview.open.length, size * size);
        assert.equal(preview.exits.length, MAX_GOALS);
        assert.equal(new Set([preview.startCell, ...preview.exits]).size, MAX_GOALS + 1);
    }
});
