// Added in v4. The shared maze generator was converted from legacy JavaScript to TypeScript; this runs the ORIGINAL file
// and the converted one on the same random numbers and demands identical output, for every board size and many goal counts.
// (Skipped automatically if the legacy/ folder has been deleted from your copy.)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as next from '@maze/shared';

const legacyUrl = new URL('../../../legacy/mazeV3/maze-game/core/maze-generator.js', import.meta.url);
const available = fs.existsSync(legacyUrl);

function withSeed<T>(seed: number, fn: () => T): T {
    const original = Math.random;
    let s = seed >>> 0;
    Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    try { return fn(); } finally { Math.random = original; }
}
const plain = (v: any) => JSON.parse(JSON.stringify(v, (_k, x) => (ArrayBuffer.isView(x) ? { typed: Array.from(x as any) } : x)));

test('converted maze generator matches the legacy one, move for move', { skip: !available }, async () => {
    const legacy: any = await import(legacyUrl.href);
    assert.deepEqual([...next.MAZE_SIZES], [...legacy.MAZE_SIZES]);
    assert.equal(next.MIN_GOALS, legacy.MIN_GOALS);
    assert.equal(next.MAX_GOALS, legacy.MAX_GOALS);
    assert.deepEqual(plain(next.DIFFICULTIES), plain(legacy.DIFFICULTIES));
    assert.deepEqual([...next.DR], [...legacy.DR]);
    assert.deepEqual([...next.DC], [...legacy.DC]);
    let compared = 0;
    for (const size of legacy.MAZE_SIZES) {
        for (const goals of [1, 2, 3, 5, 9, 17, 33, 66, 99]) {
            for (const seed of [1, 7, 2026]) {
                const a = withSeed(seed, () => legacy.generateMazeData(goals, size));
                const b = withSeed(seed, () => next.generateMazeData(goals, size));
                assert.deepEqual(plain(b), plain(a), `generateMazeData(${goals}, ${size}) seed ${seed}`);
                compared++;
            }
        }
        const pa = withSeed(5, () => legacy.generatePreviewMaze(size));
        const pb = withSeed(5, () => next.generatePreviewMaze(size));
        assert.deepEqual(plain(pb), plain(pa), `generatePreviewMaze(${size})`);
        assert.deepEqual(plain(next.getGrid(size)), plain(legacy.getGrid(size)), `getGrid(${size})`);
        compared += 2;
    }
    assert.ok(compared > 80);
});
