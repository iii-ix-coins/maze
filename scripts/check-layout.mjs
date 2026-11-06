import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'index.html', 'vite.config.ts', 'package.json',
  'src/app', 'src/components', 'src/features/home', 'src/features/market',
  'src/features/holders', 'src/features/live-feed', 'src/features/coin',
  'src/features/interaction', 'src/features/theme', 'src/features/maze/lobby',
  'src/features/maze/rooms', 'src/features/maze/create-game', 'src/features/maze/live',
  'src/features/maze/race', 'src/features/maze/canvas', 'src/features/maze/engine',
  'src/services', 'src/hooks', 'src/types', 'src/styles',
  'public/css', 'public/images', 'public/fonts', 'engines', 'shared', 'tests',
  'src/main.tsx', 'src/app/App.tsx', 'src/features/home/LegacyHomePage.tsx',
  'src/features/home/legacy-home-runtime.ts',
  'src/features/home/legacy-scripts/app.js',
  'src/features/home/legacy-scripts/components/header-init.js',
  'src/components/layout/SiteChromeHosts.tsx',
  'src/features/maze/MazePage.tsx', 'src/features/maze/engine-entry.ts',
  'src/features/maze/engine/frame.ts', 'src/features/maze/canvas/index.ts',
  'shared/maze/src/index.ts', 'engines/maze-server/src/server.ts',
  'server.js', 'start.js', 'public/css/style.css', 'public/js/app.js'
];
const missing = required.filter(file => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  console.error('[layout] missing required files:', missing.join(', '));
  process.exit(1);
}
if (fs.existsSync(path.join(root, 'apps/site')) || fs.existsSync(path.join(root, 'maze-v4'))) {
  console.error('[layout] obsolete nested frontend/workspace folders remain.');
  process.exit(1);
}
console.log('[layout] unified root Vite/React structure verified.');
