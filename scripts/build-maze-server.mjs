import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'dist', 'maze-server');

await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });

await build({
  entryPoints: [path.join(root, 'engines', 'maze-server', 'src', 'server.ts')],
  outfile: path.join(outDir, 'server.cjs'),
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node22',
  external: ['ws'],
  sourcemap: 'linked',
  legalComments: 'none',
  tsconfig: path.join(root, 'tsconfig.json'),
  logLevel: 'info',
});

// The source package is ESM for TypeScript tooling; the deployable bundle is CJS.
await fs.writeFile(path.join(outDir, 'package.json'), '{ "type": "commonjs" }\n');
console.log('[maze-server] built dist/maze-server/server.cjs');
