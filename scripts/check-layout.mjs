import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'index.html', 'coin.html', 'holders.html', 'market.html', 'vite.config.mts', 'package.json',
  'src/app', 'src/components', 'src/features/home', 'src/features/market',
  'src/features/holders', 'src/features/coin',
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
  'src/platform/wallet/WalletConnectButton.tsx', 'src/platform/wallet/wallet-session-teardown.ts',
  'src/platform/wallet/wallet-session-teardown.test.ts', 'src/platform/identity/IdentityProvider.tsx',
  'src/platform/identity/identity-client.ts', 'src/platform/identity/identity-types.ts',
  'src/components/account/UserAvatar.tsx', 'shared/identity/identity-store.js',
  'shared/identity/identity-routes.js',
  'src/features/profile/ProfilePage.tsx', 'src/app/routes.ts', 'src/app/routes.test.ts',
  'src/features/interaction/InteractionBar.tsx',
  'src/features/theme/MazeBackground.tsx',
  'src/features/maze/MazePage.tsx', 'src/features/maze/MazeMarkup.tsx', 'src/features/maze/engine-entry.ts',
  'src/features/maze/engine/frame.ts', 'src/features/maze/canvas/index.ts',
  'shared/maze/src/index.ts', 'shared/site-routes.json', 'engines/maze-server/src/server.ts',
  'server.js', 'start.js', 'shared/services/HoldersSnapshotService.js', 'src/features/holders/useHolders.ts', 'src/styles/site.css', 'scripts/check-css-duplicates.mjs', 'postcss.config.mjs', '.browserslistrc', 'public/maze-assets/assets/images/check.svg'
];
const missing = required.filter(file => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  console.error('[layout] missing required files:', missing.join(', '));
  process.exit(1);
}

const walletButtonSource = fs.readFileSync(path.join(root, 'src/platform/wallet/WalletConnectButton.tsx'), 'utf8');
const walletTeardownSource = fs.readFileSync(path.join(root, 'src/platform/wallet/wallet-session-teardown.ts'), 'utf8');
const walletTeardownTests = fs.readFileSync(path.join(root, 'src/platform/wallet/wallet-session-teardown.test.ts'), 'utf8');
if (
  !walletButtonSource.includes('Disconnect & log out') ||
  !walletButtonSource.includes('logoutAfterWalletChange') ||
  !walletButtonSource.includes('runWalletSessionTeardown') ||
  /const handleDisconnect\s*=|const handleLogout\s*=|disconnectPending|logoutPending/.test(walletButtonSource) ||
  !walletTeardownSource.includes('sessionRevoked') ||
  !walletTeardownTests.includes('does not disconnect the wallet if server logout fails') ||
  !walletTeardownTests.includes('reports partial completion if logout succeeds but wallet disconnect fails')
) {
  console.error('[layout] Wallet and Maze account teardown must use one ordered action with safe partial-failure handling and regression tests.');
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
if (
  !walletComponent.includes('loginAfterConnectRef.current = true')
  || !walletComponent.includes("view: 'Account'")
  || !walletComponent.includes("view: 'Connect'")
  || !walletComponent.includes('const authenticatorReady = signInReady || signMessageReady')
  || !walletComponent.includes('snapshot.isConnected && snapshot.address && authenticatorReady')
  || !walletComponent.includes('void performLogin()')
  || !walletComponent.includes('onSignInReady={handleSignInReady}')
  || !walletComponent.includes('onSignMessageReady={handleSignMessageReady}')
  || walletComponent.includes('nav-wallet-menu-label\">Sign in to Maze')
) {
  console.error('[layout] Wallet button must keep lazy Reown routing, automatically authenticate after connection, and avoid a separate Maze sign-in menu action.');
  process.exit(1);
}

const identityProviderSource = fs.readFileSync(path.join(root, 'src/platform/identity/IdentityProvider.tsx'), 'utf8');
const appProvidersSource = fs.readFileSync(path.join(root, 'src/app/providers/AppProviders.tsx'), 'utf8');
const identityRoutesSource = fs.readFileSync(path.join(root, 'shared/identity/identity-routes.js'), 'utf8');
const identityStoreSource = fs.readFileSync(path.join(root, 'shared/identity/identity-store.js'), 'utf8');
if (
  !appProvidersSource.includes('<IdentityProvider>') ||
  !identityProviderSource.includes('getIdentitySession') ||
  !identityProviderSource.includes("navigateTo(getSiteRoutePath('profile'))") ||
  !identityRoutesSource.includes('verifyEd25519') ||
  !identityRoutesSource.includes('requireTrustedOrigin') ||
  !identityRoutesSource.includes('sessionCookie') ||
  !identityStoreSource.includes('consumeChallengeAndCreateSession') ||
  !identityStoreSource.includes('consumed_at IS NULL') ||
  !identityProviderSource.includes('requestVersionRef') ||
  !identityRoutesSource.includes("chainId: 'solana:mainnet'")
  || !identityRoutesSource.includes('decodeSignedMessage')
  || !identityRoutesSource.includes('The wallet signed a different sign-in message.')
) {
  console.error('[layout] Identity Core must restore server sessions, verify wallet signatures, consume challenges atomically and redirect after successful login.');
  process.exit(1);
}
if (/localStorage\.(?:getItem|setItem).*?(?:session|token|identity)/i.test(identityProviderSource)) {
  console.error('[layout] Identity sessions must not be persisted in browser LocalStorage.');
  process.exit(1);
}

const packageManifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (packageManifest.scripts?.['test:identity'] !== 'node --test tests/identity/identity-routes.test.cjs') {
  console.error('[layout] The SIWS/session integration tests must remain available through npm run test:identity.');
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
for (const authPath of ['authChallenge', 'authVerify', 'authSession', 'authLogout', 'authProfile']) {
  if (!apiRouteManifest[authPath] || !apiServerManifestSource.includes(`API_PATHS.${authPath}`)) {
    console.error(`[layout] Identity API route is missing from the shared contract or Express: ${authPath}`);
    process.exit(1);
  }
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

console.log('[layout] React routes, unified wallet/account teardown, migrated Maze UI and legacy-controller retirement verified.');

// Retired transaction/verification engines and buyer feed must stay removed.
for (const retiredPath of [
  'engines/tx-engine',
  'engines/verify-engine',
  'shared/state/txState.js',
  'shared/state/tx-state.json',
]) {
  if (fs.existsSync(path.join(root, retiredPath))) {
    console.error(`[layout] retired legacy artifact remains: ${legacyPath}`);
    process.exit(1);
  }
}
// The Home Live Feed feature is retired; Holders now owns its dedicated snapshot API.
for (const retiredPath of [
  'src/features/live-feed',
  'shared/services/LiveFeedService.js',
]) {
  if (fs.existsSync(path.join(root, retiredPath))) {
    console.error(`[layout] retired Live Feed artifact remains: ${retiredPath}`);
    process.exit(1);
  }
}
const apiManifest = JSON.parse(fs.readFileSync(path.join(root, 'shared/api-routes.json'), 'utf8'));
if (apiManifest.liveFeedHolders || apiManifest.holdersTop !== '/api/holders/top') {
  console.error('[layout] API manifest must expose holdersTop and must not expose the retired Live Feed endpoint.');
  process.exit(1);
}
const holdersHook = fs.readFileSync(path.join(root, 'src/features/holders/useHolders.ts'), 'utf8');
const homePage = fs.readFileSync(path.join(root, 'src/features/home/HomePage.tsx'), 'utf8');
const holdersPage = fs.readFileSync(path.join(root, 'src/features/holders/HoldersPage.tsx'), 'utf8');
const holdersService = fs.readFileSync(path.join(root, 'shared/services/HoldersSnapshotService.js'), 'utf8');
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
if (
  !holdersHook.includes('API_PATHS.holdersTop') ||
  !/<MarketSummary\b[^>]*\bshowTitle=\{false\}/.test(homePage) ||
  homePage.includes('<HoldersPanel') ||
  homePage.includes('LiveFeedPanel') ||
  !holdersPage.includes('<HoldersPanel fullPage />')
) {
  console.error('[layout] Home must show MarketSummary without Holders/Live Feed; the dedicated Holders page must retain HoldersPanel.');
  process.exit(1);
}
if (!holdersService.includes('function getTopHolders') || !serverSource.includes('API_PATHS.holdersTop') || !serverSource.includes('HoldersSnapshotService')) {
  console.error('[layout] HoldersSnapshotService and /api/holders/top must be connected through the shared API contract.');
  process.exit(1);
}
for (const [file, source] of [['server.js', serverSource], ['useHolders.ts', holdersHook], ['HomePage.tsx', homePage], ['HoldersSnapshotService.js', holdersService]]) {
  if (/LiveFeed|liveFeed|live-feed|\/api\/live-feed\/holders|live-feed-rail-scroll/i.test(source)) {
    console.error(`[layout] retired Live Feed runtime reference remains in ${file}.`);
    process.exit(1);
  }
}
const activeCssSources = ['src/styles/home-style.css', 'src/styles/style.css', 'src/styles/arena.css']
  .map((file) => [file, fs.readFileSync(path.join(root, file), 'utf8')]);
for (const [file, source] of activeCssSources) {
  if (/\.live-(?:bar|bar-menu|menu-btn|feed-panel|feed-rail-scroll|feed-state|card)(?:[\s:#.\[]|$)|\.holder-live-card-vote|@keyframes\s+ping-dot/.test(source)) {
    console.error(`[layout] retired Live Feed CSS remains in ${file}.`);
    process.exit(1);
  }
}

const retiredSources = [
  'start.js', 'server.js', 'shared/services/HoldersSnapshotService.js',
  'src/features/holders/HoldersPanel.tsx',
  'src/features/holders/useHolders.ts', 'shared/api-routes.json',
].map((file) => [file, fs.readFileSync(path.join(root, file), 'utf8')]);
for (const [file, source] of retiredSources) {
  if (/tx-engine|verify-engine|Transaction Engine|Verify Engine|Last 100 Purchases|liveFeedBuyers|latestBuyers|txState|lastPurchaseBlockTime|holder-purchases-value|holder-last-Purchases-value/i.test(source)) {
    console.error(`[layout] removed transaction/purchase feature is still referenced: ${file}`);
    process.exit(1);
  }
}
const holderDbSource = fs.readFileSync(path.join(root, 'engines/holder-engine/lib/db.js'), 'utf8');
if (!/static SCHEMA_VERSION = 8/.test(holderDbSource) || !/DROP TABLE IF EXISTS holder_purchase_stats/.test(holderDbSource) || !/DROP TABLE IF EXISTS holder_verification/.test(holderDbSource)) {
  console.error('[layout] Holder DB must migrate existing volumes away from retired purchase/verification tables.');
  process.exit(1);
}

