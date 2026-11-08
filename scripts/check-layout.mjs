import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'index.html', 'coin.html', 'holders.html', 'market.html', 'vite.config.ts', 'package.json',
  'src/app', 'src/components', 'src/features/home', 'src/features/market',
  'src/features/holders', 'src/features/live-feed', 'src/features/coin',
  'src/features/interaction', 'src/features/theme', 'src/features/maze/lobby',
  'src/features/maze/rooms', 'src/features/maze/create-game', 'src/features/maze/live',
  'src/features/maze/race', 'src/features/maze/canvas', 'src/features/maze/engine',
  'src/services', 'src/hooks', 'src/types', 'src/styles',
  'public/css', 'public/images', 'public/fonts', 'engines', 'shared', 'tests',
  'src/main.tsx', 'src/app/App.tsx', 'src/features/home/HomePage.tsx',
  'src/components/layout/SiteChromeHosts.tsx',
  'src/components/navigation/SiteNavigation.tsx',
  'src/components/navigation/ThemeSwitcher.tsx',
  'src/components/navigation/GameViewSwitcher.tsx',
  'src/features/interaction/InteractionBar.tsx',
  'src/features/theme/MazeBackground.tsx',
  'src/features/maze/MazePage.tsx', 'src/features/maze/MazeMarkup.tsx', 'src/features/maze/engine-entry.ts',
  'src/features/maze/engine/frame.ts', 'src/features/maze/canvas/index.ts',
  'shared/maze/src/index.ts', 'engines/maze-server/src/server.ts',
  'server.js', 'start.js', 'public/css/style.css', 'public/maze-assets/assets/images/check.svg'
];
const missing = required.filter(file => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  console.error('[layout] missing required files:', missing.join(', '));
  process.exit(1);
}

const retiredLegacyPaths = [
  'public/js',
  'src/features/home/legacy-scripts',
  'src/features/theme/maze-background.js',
  'public/maze-assets/assets/app.js',
  'public/maze-assets/assets/app.css',
];
for (const legacyPath of retiredLegacyPaths) {
  if (fs.existsSync(path.join(root, legacyPath))) {
    console.error(`[layout] retired legacy controller/bootstrap remains: ${legacyPath}`);
    process.exit(1);
  }
}

function findClientScriptFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findClientScriptFiles(fullPath);
    return /\.(?:js|mjs|cjs)$/i.test(entry.name) ? [path.relative(root, fullPath)] : [];
  });
}
const remainingClientScripts = [
  ...findClientScriptFiles(path.join(root, 'src')),
  ...findClientScriptFiles(path.join(root, 'public')),
];
if (remainingClientScripts.length) {
  console.error('[layout] standalone JavaScript files remain in the React-owned client tree:', remainingClientScripts.join(', '));
  process.exit(1);
}

const activeHtmlPages = ['index.html', 'coin.html', 'holders.html', 'market.html'];
for (const page of activeHtmlPages) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  if (/\bsrc=[\"'][^\"']*\/js\/[^\"']+\.js(?:[?#][^\"']*)?[\"']/i.test(html)) {
    console.error(`[layout] active page still loads a public legacy script: ${page}`);
    process.exit(1);
  }
  if (!/<script type=[\"']module[\"'] src=[\"']\/src\/main\.tsx[\"']><\/script>/i.test(html)) {
    console.error(`[layout] active page must mount the shared React entry: ${page}`);
    process.exit(1);
  }
  if (!html.includes("localStorage.getItem('hollld-theme')")) {
    console.error(`[layout] active page is missing pre-paint theme initialization: ${page}`);
    process.exit(1);
  }
}

for (const fallbackPage of ['legacy/home.html', 'legacy/maze.html']) {
  const html = fs.readFileSync(path.join(root, fallbackPage), 'utf8');
  if (/<script\b/i.test(html) || /\bsrc=[\"'][^\"']*\.js[\"']/i.test(html)) {
    console.error(`[layout] server fallback must not load retired controllers: ${fallbackPage}`);
    process.exit(1);
  }
}

if (fs.existsSync(path.join(root, 'apps/site')) || fs.existsSync(path.join(root, 'maze-v4'))) {
  console.error('[layout] obsolete nested frontend/workspace folders remain.');
  process.exit(1);
}
const activeFrontend = [
  'src/app/router.tsx',
  'src/features/home/HomePage.tsx',
  'src/features/maze/MazePage.tsx',
  'src/components/layout/SiteChromeHosts.tsx',
  'src/components/navigation/SiteNavigation.tsx',
  'src/features/interaction/InteractionBar.tsx',
  'src/features/market/MarketSummary.tsx',
  'src/features/market/MarketPage.tsx',
  'src/features/coin/CoinPage.tsx',
  'src/features/holders/HoldersPanel.tsx',
  'src/features/holders/HoldersPage.tsx',
  'src/features/live-feed/LiveFeedPanel.tsx',
];
for (const file of activeFrontend) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  if (/legacy-home-runtime|bootLegacyHomeScripts/.test(source)) {
    console.error(`[layout] active frontend still boots legacy Home scripts: ${file}`);
    process.exit(1);
  }
}

const mazeBaseline = fs.readFileSync(path.join(root, 'src/features/maze/maze-markup.html'), 'utf8');
const mazeReact = fs.readFileSync(path.join(root, 'src/features/maze/MazeMarkup.tsx'), 'utf8');
const mazeMenu = fs.readFileSync(path.join(root, 'src/features/maze/ui/react/MazeMenu.tsx'), 'utf8');
const mazeRuntimeUi = fs.readFileSync(path.join(root, 'src/features/maze/ui/react/MazeRuntimeUi.tsx'), 'utf8');
const mazeThemeController = fs.readFileSync(path.join(root, 'src/features/maze/engine/theme.ts'), 'utf8');
const mazeBackground = fs.readFileSync(path.join(root, 'src/features/theme/MazeBackground.tsx'), 'utf8');
const baselineIds = [...mazeBaseline.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]);
// IDs now live across the static React game tree and the React-owned dynamic menu.
// Dynamic tab IDs use a conditional expression, so check their quoted literals too.
const reactMazeSources = `${mazeReact}\n${mazeMenu}\n${mazeRuntimeUi}`;
const missingMazeIds = baselineIds.filter(id => {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const explicitId = new RegExp(`\\bid\\s*=\\s*(?:\\{\\s*[\"']${escaped}[\"']\\s*\\}|[\"']${escaped}[\"'])`);
  return !explicitId.test(reactMazeSources) && !reactMazeSources.includes(`'${id}'`);
});
if (missingMazeIds.length) {
  console.error('[layout] Maze React tree is missing legacy DOM IDs:', missingMazeIds.join(', '));
  process.exit(1);
}
if (/dangerouslySetInnerHTML/.test(mazeReact)) {
  console.error('[layout] Maze React markup must not inject the original HTML string.');
  process.exit(1);
}
const createController = fs.readFileSync(path.join(root, 'src/features/maze/ui/create-game/create-game.ts'), 'utf8');
const lobbyCoordinator = fs.readFileSync(path.join(root, 'src/features/maze/ui/lobby/lobby-hub.ts'), 'utf8');
const domUiApi = /\b(?:document\.|querySelector(?:All)?\(|createElement\(|replaceChildren\(|innerHTML|classList\.)/;
if (domUiApi.test(createController) || domUiApi.test(lobbyCoordinator)) {
  console.error('[layout] CreateGameComponent and LobbyHub must remain DOM-free state/protocol adapters.');
  process.exit(1);
}
const raceBoardSource = fs.readFileSync(path.join(root, 'src/features/maze/ui/race-board.ts'), 'utf8');
const hudSource = fs.readFileSync(path.join(root, 'src/features/maze/engine/hud.ts'), 'utf8');
if (domUiApi.test(raceBoardSource) || domUiApi.test(hudSource)) {
  console.error('[layout] Race Board and HUD adapters must publish state without imperative DOM rendering.');
  process.exit(1);
}
if (!/useSyncExternalStore/.test(mazeRuntimeUi) || !/raceBoardStore/.test(mazeRuntimeUi) || !/mazeHudStore/.test(mazeRuntimeUi)) {
  console.error('[layout] in-race UI must be subscribed to the React external stores.');
  process.exit(1);
}
if (/querySelectorAll|classList\.|setAttribute\(|textContent|innerHTML/.test(mazeThemeController)) {
  console.error('[layout] Maze theme controller must publish state instead of mutating React-owned controls.');
  process.exit(1);
}
if (/document\.createElement|createElementNS|appendChild\(|initMazeBackground/.test(mazeBackground) || !/createPortal/.test(mazeBackground)) {
  console.error('[layout] site background must be React-owned and must not use a DOM bootstrap.');
  process.exit(1);
}
const siteChromeSource = fs.readFileSync(path.join(root, 'src/components/layout/SiteChromeHosts.tsx'), 'utf8');
if (!/\<MazeBackground\s*\/>/.test(siteChromeSource)) {
  console.error('[layout] React site chrome must mount the React-owned Maze background.');
  process.exit(1);
}
for (const component of ['function CreateWizard', 'export function RoomsPanel', 'export function LivePanel', 'export function RoomPanel']) {
  if (!mazeMenu.includes(component)) {
    console.error(`[layout] React Maze menu is missing ${component}.`);
    process.exit(1);
  }
}
for (const component of ['export function MiniMapTile', 'export function RaceBoardView', 'export function WinCardView', 'export function HudStats', 'export function ThemeControls', 'export function ConfirmDialog', 'export function MazeBanner']) {
  if (!mazeRuntimeUi.includes(component)) {
    console.error(`[layout] React in-race UI is missing ${component}.`);
    process.exit(1);
  }
}
for (const obsolete of ['rooms-view.ts', 'room-view.ts', 'live-view.ts', 'card-list.ts', 'lobby-toolbar.ts', 'seat-bloom.ts', 'create-game/controls.ts', 'create-game/step-rail.ts']) {
  if (fs.existsSync(path.join(root, 'src/features/maze/ui', obsolete))) {
    console.error(`[layout] obsolete imperative Maze UI controller remains: ${obsolete}`);
    process.exit(1);
  }
}
const featureRouter = fs.readFileSync(path.join(root, 'src/app/router.tsx'), 'utf8');
for (const route of ['/coin.html', '/holders.html', '/market.html']) {
  if (!featureRouter.includes(route)) {
    console.error(`[layout] React router is missing active site route: ${route}`);
    process.exit(1);
  }
}
const viteConfig = fs.readFileSync(path.join(root, 'vite.config.ts'), 'utf8');
for (const page of ['coin.html', 'holders.html', 'market.html']) {
  if (!viteConfig.includes(`'${page}'`)) {
    console.error(`[layout] Vite production inputs are missing ${page}.`);
    process.exit(1);
  }
}

console.log('[layout] React routes, migrated Maze UI and legacy-controller retirement verified.');
