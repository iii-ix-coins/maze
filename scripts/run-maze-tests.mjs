import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testRoot = path.join(root, 'tests', 'maze');

function collect(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collect(full);
    return entry.isFile() && entry.name.endsWith('.test.ts') ? [full] : [];
  });
}

const files = collect(testRoot);
if (!files.length) {
  console.error('[maze-tests] no Maze unit tests found');
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ['--import', 'tsx', '--test', ...files],
  { cwd: root, stdio: 'inherit' },
);
process.exit(result.status ?? 1);
