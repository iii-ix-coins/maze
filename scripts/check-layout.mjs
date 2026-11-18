import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'index.html', 'coin.html', 'holders.html', 'market.html', 'vite.config.mts', 'package.json',
  'src/app', 'src/components', 'src/features/home', 'src/features/market',
  'src/features/holders', 'src/features/live-feed', 'src/features/coin',
  'src/features/interaction', 'src/features/theme', 'src/features/maze/lobby',
  'src/features/maze/rooms', 'src/features/maze/create-game', 'src/features/maze/live',
  'src/features/maze/race', 'src/features/maze/canvas', 'src/features/maze/engine',
  'src/services', 'src/hooks', 'src/types', 'src/styles',
  'public/css', 'public/css/images', 'public/css/font', 'engines', 'shared', 'tests',
  'src/main.tsx', 'src/app/App.tsx', 'src/features/home/HomePage.tsx',
  'src/components/layout/SiteChromeHosts.tsx',
  'src/components/navigation/SiteNavigation.tsx',
  'src/components/navigation/ThemeSwitcher.tsx',
  'src/components/navigation/GameViewSwitcher.tsx',
  'src/platform/wallet/WalletConnectButton.tsx',
  'src/features/profile/ProfilePage.tsx', 'src/app/routes.ts', 'src/app/routes.test.ts',
  'src/features/interaction/InteractionBar.tsx',
  'src/features/theme/MazeBackground.tsx',
  'src/features/maze/MazePage.tsx', 'src/features/maze/MazeMarkup.tsx', 'src/features/maze/engine-entry.ts',
  'src/features/maze/engine/frame.ts', 'src/features/maze/canvas/index.ts',
  'shared/maze/src/index.ts', 'shared/site-routes.json', 'engines/maze-server/src/server.ts',
  'server.js', 'start.js', 'src/styles/site.css', 'scripts/check-css-duplicates.mjs', 'postcss.config.mjs', '.browserslistrc', 'public/maze-assets/assets/images/check.svg'
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

for (const retiredCss of ['style.css', 'header-scroll-scrim.css', 'maze-camera.css', 'home-style.css', 'feature-pages.css']) {
  if (fs.existsSync(path.join(root, 'public', 'css', retiredCss))) {
    console.error(`[layout] active stylesheet must be sourced from src/styles, not public/css: ${retiredCss}`);
    process.exit(1);
  }
}

const activeHtmlPages = ['index.html'];
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
  if (html.split('<!-- @shared-styles -->').length !== 2) {
    console.error(`[layout] active page must contain exactly one shared-styles marker: ${page}`);
    process.exit(1);
  }
  if (/document\.title\s*=/.test(html)) {
    console.error(`[layout] document.title must be owned by the React route manifest, not inline HTML: ${page}`);
    process.exit(1);
  }
  if (!html.includes("localStorage.getItem('hollld-theme')")) {
    console.error(`[layout] active page is missing pre-paint theme initialization: ${page}`);
    process.exit(1);
  }
  if (!html.includes('/* @maze-route-paths */')) {
    console.error(`[layout] Maze pre-paint route setup must be injected from the shared route manifest: ${page}`);
    process.exit(1);
  }
  if (!html.includes('<!-- @site-default-title -->')) {
    console.error(`[layout] the static document title must be injected from the shared route manifest: ${page}`);
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

const activeHtmlPagesForCss = ['index.html'];
for (const page of activeHtmlPagesForCss) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  if (!html.includes('href="/src/styles/site.css"')) {
    console.error(`[layout] ${page} must load the single centralized CSS entry /src/styles/site.css.`);
    process.exit(1);
  }
  if (/href=["'][^"']*\/css\/(?:style|home-style|feature-pages|header-scroll-scrim|maze-camera)\.css/i.test(html)) {
    console.error(`[layout] ${page} still loads an unprocessed public CSS file.`);
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
const appSource = fs.readFileSync(path.join(root, 'src/app/App.tsx'), 'utf8');
if (!/lazy\(\(\) => import\('..\/features\/maze\/MazePage'/.test(appSource)) {
  console.error('[layout] MazePage must be loaded as a route-level lazy chunk.');
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
if (!featureRouter.includes('resolveSiteRoute') || !featureRouter.includes('PAGE_COMPONENTS')) {
  console.error('[layout] React router must resolve active routes from the shared route manifest.');
  process.exit(1);
}

const navigationComponent = fs.readFileSync(path.join(root, 'src/components/navigation/SiteNavigation.tsx'), 'utf8');
const walletComponent = fs.readFileSync(path.join(root, 'src/platform/wallet/WalletConnectButton.tsx'), 'utf8');
const utilitiesPosition = navigationComponent.indexOf('className="nav-utilities"');
const walletPosition = navigationComponent.indexOf('<WalletConnectButton />');
if (utilitiesPosition < 0 || walletPosition < utilitiesPosition) {
  console.error('[layout] WalletConnectButton must remain in the header utilities row, outside the mobile links panel.');
  process.exit(1);
}
const secondaryRowMatch = navigationComponent.match(/<div className="nav-secondary-row">([\s\S]*?)<\/div>/);
if (!secondaryRowMatch || !secondaryRowMatch[1].includes('<GameViewSwitcher />') || !secondaryRowMatch[1].includes('<ThemeSwitcher />')) {
  console.error('[layout] GameViewSwitcher and ThemeSwitcher must share the independent nav-secondary-row.');
  process.exit(1);
}
if (!walletComponent.includes('if (snapshot.isConnected)') || !walletComponent.includes("view: 'Account'") || !walletComponent.includes("view: 'Connect'")) {
  console.error('[layout] Wallet menu must preserve the existing direct-connect and Reown Account/Connect routing.');
  process.exit(1);
}

const apiRouteManifest = JSON.parse(fs.readFileSync(path.join(root, 'shared/api-routes.json'), 'utf8'));
const sharedApiContractSource = fs.readFileSync(path.join(root, 'src/services/api/contracts.ts'), 'utf8');
const apiServerManifestSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const apiRouteValues = Object.values(apiRouteManifest);
if (new Set(apiRouteValues).size !== apiRouteValues.length || apiRouteValues.some((route) => typeof route !== 'string' || !route.startsWith('/'))) {
  console.error('[layout] shared API route manifest contains duplicate or invalid endpoint paths.');
  process.exit(1);
}
if (!sharedApiContractSource.includes("../../../shared/api-routes.json") || !apiServerManifestSource.includes("require('./shared/api-routes.json')")) {
  console.error('[layout] Browser API clients and Express must consume the same API route manifest.');
  process.exit(1);
}
if (/['"]\/api\//.test(sharedApiContractSource) || /['"]\/(?:health|api\/)/.test(apiServerManifestSource)) {
  console.error('[layout] API endpoint paths must not be duplicated as string literals in clients or Express.');
  process.exit(1);
}

const routeManifest = JSON.parse(fs.readFileSync(path.join(root, 'shared/site-routes.json'), 'utf8'));
const allRoutePaths = routeManifest.routes.flatMap((route) => route.paths);
if (new Set(allRoutePaths).size !== allRoutePaths.length) {
  console.error('[layout] shared route manifest contains duplicate path declarations.');
  process.exit(1);
}
const mazeRoute = routeManifest.routes.find((route) => route.id === 'maze');
if (!mazeRoute?.paths.includes('/maze.html') || !mazeRoute.paths.includes('/play') || mazeRoute.server !== 'maze' || mazeRoute.soft) {
  console.error('[layout] Maze document aliases must be declared once in the shared route manifest and remain hard navigations.');
  process.exit(1);
}
for (const routeId of ['home', 'maze', 'coin', 'holders', 'market', 'profile']) {
  if (!routeManifest.routes.some((route) => route.id === routeId)) {
    console.error(`[layout] shared route manifest is missing route: ${routeId}`);
    process.exit(1);
  }
}
const profileRoute = routeManifest.routes.find((route) => route.id === 'profile');
if (!profileRoute?.paths.includes('/profile') || profileRoute.server !== 'spa' || !profileRoute.soft) {
  console.error('[layout] Profile must be registered once for the React router, soft navigation and server refresh.');
  process.exit(1);
}
const profileRouter = fs.readFileSync(path.join(root, 'src/app/router.tsx'), 'utf8');
const profileNavigation = fs.readFileSync(path.join(root, 'src/app/navigation.ts'), 'utf8');
const profileServer = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
if (!profileRouter.includes('resolveSiteRoute') || !profileNavigation.includes('SOFT_NAVIGATION_PATHS') || !profileServer.includes("require('./shared/site-routes.json')")) {
  console.error('[layout] React, soft navigation and Express must consume the shared route manifest.');
  process.exit(1);
}
if (profileNavigation.includes('document.title')) {
  console.error('[layout] document.title must have one owner (App.tsx), not be assigned by both navigation and React effects.');
  process.exit(1);
}
const appTitleSource = fs.readFileSync(path.join(root, 'src/app/App.tsx'), 'utf8');
const sharedRoutesSource = fs.readFileSync(path.join(root, 'src/app/routes.ts'), 'utf8');
if ((appTitleSource.match(/document\.title\s*=/g) || []).length !== 1 || !appTitleSource.includes('SITE_DEFAULT_TITLE') || !sharedRoutesSource.includes('SITE_DEFAULT_TITLE')) {
  console.error('[layout] document title must be assigned once and sourced from the route manifest.');
  process.exit(1);
}

const sharedSiteStyles = fs.readFileSync(path.join(root, 'src/styles/site.css'), 'utf8');
const globalStyles = fs.readFileSync(path.join(root, 'src/styles/style.css'), 'utf8');
if (
  !sharedSiteStyles.includes('grid-template-areas:\n            "brand content utilities"\n            "secondary secondary secondary"') ||
  !sharedSiteStyles.includes('grid-template-areas:\n            "brand utilities"\n            "secondary secondary"') ||
  !sharedSiteStyles.includes('.nav-secondary-row') ||
  !sharedSiteStyles.includes('gap: 6px;')
) {
  console.error('[layout] site.css must be the single owner of the responsive header grid and six-pixel switcher gap.');
  process.exit(1);
}
if (/\.nav-inner\s*\{[^}]*grid-template-areas/s.test(globalStyles) || /\.nav-inner\s*\{[^}]*display:\s*grid/s.test(globalStyles) || /\.nav-inner\s*\{[^}]*display:\s*flex/s.test(globalStyles)) {
  console.error('[layout] style.css must not define a second nav-inner layout.');
  process.exit(1);
}
if (/\.nav\s+\.game-view-toggle\s*\{[^}]*margin-top\s*:/s.test(globalStyles)) {
  console.error('[layout] GameViewSwitcher must not add a separate top margin outside nav-secondary-row.');
  process.exit(1);
}

const mazePageSource = fs.readFileSync(path.join(root, 'src/features/maze/MazePage.tsx'), 'utf8');
const mazeStyleEntry = fs.readFileSync(path.join(root, 'src/features/maze/styles/index.css'), 'utf8');
if ((mazePageSource.match(/\.\/styles\/index\.css/g) || []).length !== 1 || /\.\/styles\/(?:maze-site|maze-unify|maze-theme|create-game|lobby)\.css/.test(mazePageSource)) {
  console.error('[layout] MazePage must load its feature styles through one canonical CSS entry.');
  process.exit(1);
}
for (const requiredMazeStyle of ['maze-site.css', 'maze-unify.css', 'maze-theme.css', 'create-game.css', 'lobby.css', 'maze-menu.css']) {
  if (!mazeStyleEntry.includes(requiredMazeStyle)) {
    console.error(`[layout] Maze CSS entry is missing ${requiredMazeStyle}.`);
    process.exit(1);
  }
}

const apiContractSource = fs.readFileSync(path.join(root, 'src/services/api/contracts.ts'), 'utf8');
for (const apiConsumer of [
  'src/features/interaction/InteractionBar.tsx',
  'src/features/live-feed/LiveFeedPanel.tsx',
  'src/features/holders/useHolders.ts',
  'src/features/coin/CoinPage.tsx',
  'src/features/market/useMarketData.ts',
]) {
  const source = fs.readFileSync(path.join(root, apiConsumer), 'utf8');
  if (!source.includes('API_PATHS') || !source.includes("services/api/contracts")) {
    console.error(`[layout] client API consumer must use the shared API contract: ${apiConsumer}`);
    process.exit(1);
  }
}
if (!apiContractSource.includes('export const API_PATHS')) {
  console.error('[layout] shared API contract is missing API_PATHS.');
  process.exit(1);
}

const packageConfig = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (!packageConfig.scripts['test:maze:run'] || !packageConfig.scripts.check.includes('test:maze:run') || !packageConfig.scripts['check:css:duplicates'] || !packageConfig.scripts.check.includes('check:css:duplicates')) {
  console.error('[layout] npm run check must execute Maze tests against the server build created earlier in the same check.');
  process.exit(1);
}
const viteConfig = fs.readFileSync(path.join(root, 'vite.config.mts'), 'utf8');
if (!viteConfig.includes("shared/site-routes.json") || !viteConfig.includes("@maze-route-paths") || !viteConfig.includes("@site-default-title")) {
  console.error('[layout] Vite must inject pre-paint Maze route paths and the default title from the shared site route manifest.');
  process.exit(1);
}
if (!viteConfig.includes("main: path.resolve(root, 'index.html')")) {
  console.error('[layout] Vite production must emit one shared SPA document.');
  process.exit(1);
}

console.log('[layout] React routes, migrated Maze UI and legacy-controller retirement verified.');
