import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'index.html', 'vite.config.mts', 'package.json',
  'src/app', 'src/components', 'src/features/home', 'src/features/market', 'src/features/explore',
  'src/features/theme', 'src/features/maze/lobby',
  'src/features/maze/rooms', 'src/features/maze/create-game', 'src/features/maze/live',
  'src/features/maze/race', 'src/features/maze/canvas', 'src/features/maze/engine',
  'src/services', 'src/hooks', 'src/types', 'src/styles',
  'public/css', 'public/css/images', 'public/css/font', 'engines', 'shared', 'tests',
  'src/main.tsx', 'src/app/App.tsx', 'src/features/home/HomePage.tsx', 'src/styles/theme-tokens.css',
  'src/components/layout/SiteChromeHosts.tsx',
  'src/components/navigation/SiteNavigation.tsx',
  'src/components/navigation/ThemeSwitcher.tsx',
  'src/features/explore/ExplorePage.tsx',
  'src/platform/wallet/WalletConnectButton.tsx', 'src/platform/wallet/wallet-session-teardown.ts',
  'src/platform/wallet/wallet-session-teardown.test.ts', 'src/platform/identity/IdentityProvider.tsx',
  'src/platform/identity/identity-client.ts', 'src/platform/identity/identity-types.ts',
  'src/components/account/UserAvatar.tsx', 'shared/identity/identity-store.js',
  'shared/identity/identity-routes.js',
  'src/features/profile/ProfilePage.tsx', 'src/app/routes.ts', 'src/app/routes.test.ts',
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
const retiredCssArchitecture = [
  'src/styles/arena.css',
  'src/styles/feature-pages.css',
  'src/features/maze/ui/react/maze-menu.css',
  'public/css/maze-style.css',
];
for (const retiredPath of retiredCssArchitecture) {
  if (fs.existsSync(path.join(root, retiredPath))) {
    console.error(`[layout] retired CSS architecture file remains: ${retiredPath}`);
    process.exit(1);
  }
}
const siteCssEntry = fs.readFileSync(path.join(root, 'src/styles/site.css'), 'utf8');
if (!siteCssEntry.includes('@import "./theme-tokens.css";') || /@import\s+["']\.\/arena\.css["']/.test(siteCssEntry)) {
  console.error('[layout] site.css must load the dedicated theme token owner and must not load arena.css.');
  process.exit(1);
}

const retiredInteractionPaths = [
  'src/features/interaction',
  'engines/interaction-engine',
  'shared/interactionClient.js',
  'shared/state/interactionState.js',
  'shared/state/interaction-state.json',
];
for (const retiredPath of retiredInteractionPaths) {
  if (fs.existsSync(path.join(root, retiredPath))) {
    console.error(`[layout] retired Interaction Bar code remains: ${retiredPath}`);
    process.exit(1);
  }
}
const interactionFreeSources = [
  'src/components/layout/SiteChromeHosts.tsx',
  'src/app/router.tsx',
  'src/styles/site.css',
  'src/styles/style.css',
  'src/features/maze/styles/maze-unify.css',
  'server.js',
  'start.js',
  'shared/api-routes.json',
];
for (const file of interactionFreeSources) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  if (/InteractionBar|site-interaction-bar|site-share-modal|\/api\/stats|interaction-engine|interactionClient|INTERACTION_HOST/.test(source)) {
    console.error(`[layout] retired Interaction Bar references remain in ${file}.`);
    process.exit(1);
  }
}
const chromeSource = fs.readFileSync(path.join(root, 'src/components/layout/SiteChromeHosts.tsx'), 'utf8');
if (!chromeSource.includes('<SiteNavigation />') || chromeSource.includes('<InteractionBar')) {
  console.error('[layout] SiteChromeHosts must mount only the shared SiteNavigation chrome.');
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

for (const retiredCss of ['style.css', 'header-scroll-scrim.css', 'maze-camera.css', 'home-style.css', 'feature-pages.css', 'theme-tokens.css', 'arena.css']) {
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
  'src/features/market/MarketSummary.tsx',
  'src/features/explore/ExplorePage.tsx',
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
const themeSwitcherComponent = fs.readFileSync(path.join(root, 'src/components/navigation/ThemeSwitcher.tsx'), 'utf8');
const exploreComponent = fs.readFileSync(path.join(root, 'src/features/explore/ExplorePage.tsx'), 'utf8');
const chromeComponent = fs.readFileSync(path.join(root, 'src/components/layout/SiteChromeHosts.tsx'), 'utf8');
const profileComponent = fs.readFileSync(path.join(root, 'src/features/profile/ProfilePage.tsx'), 'utf8');
const walletComponent = fs.readFileSync(path.join(root, 'src/platform/wallet/WalletConnectButton.tsx'), 'utf8');
if (
  !navigationComponent.includes("label: 'Explore'") ||
  navigationComponent.includes("label: 'Market'") ||
  navigationComponent.includes("label: 'Token'") ||
  !navigationComponent.includes('href={MAZE_VIEW_URLS.create}') ||
  !exploreComponent.includes('MAZE_VIEW_URLS.live') ||
  !exploreComponent.includes('MAZE_VIEW_URLS.rooms')
) {
  console.error('[layout] Dock must keep Create, replace Market/Token with Explore, and Explore must link to the existing Maze Live and Rooms views.');
  process.exit(1);
}
if (
  navigationComponent.includes('<WalletConnectButton />') ||
  !navigationComponent.includes("getSiteRoutePath('profile')") ||
  !navigationComponent.includes("label: 'Profile'") ||
  !navigationComponent.includes('site-bottom-nav')
) {
  console.error('[layout] Bottom navigation must expose a Profile destination and must not own the wallet connection button.');
  process.exit(1);
}
const notificationsIndex = navigationComponent.indexOf('<NotificationsMenu');
const themeIndex = navigationComponent.indexOf('<ThemeSwitcher />');
const createIndex = navigationComponent.indexOf('nav-dock-create');
if (
  !chromeComponent.includes('id="site-brand"') ||
  chromeComponent.includes('id="site-controls"') ||
  chromeComponent.includes('GameViewSwitcher') ||
  chromeComponent.includes('<ThemeSwitcher />') ||
  !navigationComponent.includes('<ThemeSwitcher />') ||
  !themeSwitcherComponent.includes('theme-toggle--vertical') ||
  createIndex < 0 ||
  notificationsIndex <= createIndex ||
  themeIndex <= notificationsIndex ||
  !navigationComponent.includes('No notifications yet') ||
  navigationComponent.includes('MoreMenu') ||
  navigationComponent.includes('Holders')
) {
  console.error('[layout] Brand must remain outside the dock; vertical theme selection and Notifications must be inside it, with no Holders/More entries.');
  process.exit(1);
}
if (
  !profileComponent.includes("status === 'anonymous'") ||
  !profileComponent.includes('<WalletConnectButton />') ||
  !profileComponent.includes('profile-connect-stage')
) {
  console.error('[layout] Wallet connection must be presented in the centered Profile prompt only for anonymous sessions.');
  process.exit(1);
}
if (
  !walletComponent.includes("import('./WalletConnectRuntime')")
  || !walletComponent.includes("view: 'Account'")
  || !walletComponent.includes("view: 'Connect'")
  || !walletComponent.includes('const authenticatorReady = signInReady || signMessageReady')
  || !walletComponent.includes('const [loginRequested, setLoginRequested] = useState(false)')
  || !walletComponent.includes('if (!loginRequested) return;')
  || !walletComponent.includes("snapshot.status === 'reconnecting'")
  || !walletComponent.includes('void performLogin()')
  || !walletComponent.includes('onSignInReady={handleSignInReady}')
  || !walletComponent.includes('onSignMessageReady={handleSignMessageReady}')
  || !walletComponent.includes('onModalOpenChange={handleModalOpenChange}')
  || !walletComponent.includes('onSigningStatusChange={handleSigningStatusChange}')
  || !walletComponent.includes("signingStatus === 'unsupported'")
  || !walletComponent.includes('connectModalExpectedRef.current')
  || walletComponent.includes('loginAfterConnectRef')
  || walletComponent.includes('nav-wallet-options-button')
  || walletComponent.includes('nav-wallet-menu-label">Sign in to Maze')
) {
  console.error('[layout] Wallet button must keep lazy Reown routing, require an explicit login intent, authenticate only after a stable connected account and signer are ready, and have no secondary wallet-options/sign-in button.');
  process.exit(1);
}
const walletStyles = [
  fs.readFileSync(path.join(root, 'src/styles/style.css'), 'utf8'),
  fs.readFileSync(path.join(root, 'src/styles/theme-tokens.css'), 'utf8'),
].join('\n');
if (walletStyles.includes('nav-wallet-options-button')) {
  console.error('[layout] the obsolete secondary wallet-options button styles must be fully retired.');
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
for (const routeId of ['home', 'maze', 'explore', 'profile']) {
  if (!routeManifest.routes.some((route) => route.id === routeId)) {
    console.error(`[layout] shared route manifest is missing route: ${routeId}`);
    process.exit(1);
  }
}
if (routeManifest.routes.some((route) => route.id === 'holders' || route.paths.some((routePath) => routePath === '/holders' || routePath === '/holders.html'))) {
  console.error('[layout] the Holders page and aliases must be absent from the shared route manifest.');
  process.exit(1);
}
const exploreRoute = routeManifest.routes.find((route) => route.id === 'explore');
if (!exploreRoute?.paths.includes('/explore') || exploreRoute.server !== 'spa' || !exploreRoute.soft || exploreRoute.navKey !== 'explore') {
  console.error('[layout] Explore must be registered as a soft SPA route and navigation destination.');
  process.exit(1);
}
if (routeManifest.routes.some((route) => ['coin', 'market'].includes(route.id))) {
  console.error('[layout] retired standalone Token/Coin and Market routes must not remain in the shared route manifest.');
  process.exit(1);
}
const retiredPagePaths = ['coin.html', 'market.html', 'src/features/coin', 'src/features/market/MarketPage.tsx', 'src/components/navigation/GameViewSwitcher.tsx'];
if (retiredPagePaths.some((file) => fs.existsSync(path.join(root, file)))) {
  console.error('[layout] removed Token/Coin, standalone Market or top-right game switcher files must not remain.');
  process.exit(1);
}
const profileRoute = routeManifest.routes.find((route) => route.id === 'profile');
if (!profileRoute?.paths.includes('/profile') || profileRoute.server !== 'spa' || !profileRoute.soft || profileRoute.navKey !== 'profile') {
  console.error('[layout] Profile must be registered for React routing, soft navigation, server refresh and the bottom dock.');
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
const themeSlotRule = sharedSiteStyles.match(/\.site-bottom-nav \.nav-dock-theme-slot \.theme-toggle--vertical\s*\{([^}]*)\}/s)?.[1] ?? '';
const themeSlotHostRule = sharedSiteStyles.match(/\.site-bottom-nav \.nav-dock-theme-slot\s*\{([^}]*)\}/s)?.[1] ?? '';
if (
  !sharedSiteStyles.includes('.nav.site-bottom-nav') ||
  !sharedSiteStyles.includes('grid-template-columns: repeat(5, minmax(0, 1fr)) auto') ||
  !sharedSiteStyles.includes('#site-brand') ||
  !sharedSiteStyles.includes('.nav-dock-theme-slot .theme-toggle--vertical') ||
  !themeSlotHostRule.includes('width: max-content;') ||
  !themeSlotRule.includes('border: 0;') ||
  !themeSlotRule.includes('background: transparent;') ||
  !sharedSiteStyles.includes('.nav-notifications-panel') ||
  sharedSiteStyles.includes('#site-controls')
) {
  console.error('[layout] site.css must own the bottom dock, vertical theme selector and Notifications panel; no top utility host may remain.');
  process.exit(1);
}
if (/\.nav-inner\s*\{[^}]*grid-template-areas/s.test(globalStyles) || /\.nav-inner\s*\{[^}]*display:\s*grid/s.test(globalStyles) || /\.nav-inner\s*\{[^}]*display:\s*flex/s.test(globalStyles)) {
  console.error('[layout] style.css must not define a second nav-inner layout.');
  process.exit(1);
}

const mazePageSource = fs.readFileSync(path.join(root, 'src/features/maze/MazePage.tsx'), 'utf8');
const mazeStyleEntry = fs.readFileSync(path.join(root, 'src/features/maze/styles/index.css'), 'utf8');
if ((mazePageSource.match(/\.\/styles\/index\.css/g) || []).length !== 1 || /\.\/styles\/(?:maze-site|maze-unify|maze-theme|create-game|lobby)\.css/.test(mazePageSource)) {
  console.error('[layout] MazePage must load its feature styles through one canonical CSS entry.');
  process.exit(1);
}
for (const requiredMazeStyle of ['maze-site.css', 'maze-unify.css', 'maze-theme.css', 'create-game.css', 'lobby.css']) {
  if (!mazeStyleEntry.includes(requiredMazeStyle)) {
    console.error(`[layout] Maze CSS entry is missing ${requiredMazeStyle}.`);
    process.exit(1);
  }
}

const apiContractSource = fs.readFileSync(path.join(root, 'src/services/api/contracts.ts'), 'utf8');
for (const apiConsumer of [
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

console.log('[layout] React routes, notification/theme dock, Holders retirement, unified wallet teardown and migrated Maze UI verified.');

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
// The Home Live Feed and dedicated Holders features are retired.
for (const retiredPath of [
  'src/features/live-feed',
  'shared/services/LiveFeedService.js',
  'holders.html',
  'holders-api.json',
  'src/features/holders',
  'shared/services/HoldersSnapshotService.js',
  'shared/state/holderState.js',
  'shared/state/holder-state.json',
  'engines/holder-engine',
]) {
  if (fs.existsSync(path.join(root, retiredPath))) {
    console.error(`[layout] retired feature artifact remains: ${retiredPath}`);
    process.exit(1);
  }
}
const apiManifest = JSON.parse(fs.readFileSync(path.join(root, 'shared/api-routes.json'), 'utf8'));
if (apiManifest.liveFeedHolders || apiManifest.holdersTop || apiManifest.holdersSummary) {
  console.error('[layout] the shared API contract must not expose retired Holders or Live Feed endpoints.');
  process.exit(1);
}
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const startSource = fs.readFileSync(path.join(root, 'start.js'), 'utf8');
const homePage = fs.readFileSync(path.join(root, 'src/features/home/HomePage.tsx'), 'utf8');
const marketSummary = fs.readFileSync(path.join(root, 'src/features/market/MarketSummary.tsx'), 'utf8');
if (
  !/<MarketSummary\b[^>]*\bshowTitle=\{false\}/.test(homePage) ||
  homePage.includes('HoldersPanel') ||
  marketSummary.includes('data-market="holders"') ||
  /HoldersSnapshotService|holdersTop|holdersSummary|getHolderState/.test(serverSource) ||
  /Holder Engine|holder-engine/.test(startSource)
) {
  console.error('[layout] Holders page/service/engine must be retired while Home keeps its compact market summary.');
  process.exit(1);
}
for (const [file, source] of [['server.js', serverSource], ['HomePage.tsx', homePage], ['MarketSummary.tsx', marketSummary]]) {
  if (/LiveFeed|liveFeed|live-feed|\/api\/live-feed\/holders|live-feed-rail-scroll/i.test(source)) {
    console.error(`[layout] retired Live Feed runtime reference remains in ${file}.`);
    process.exit(1);
  }
}
const activeCssSources = [
  'src/styles/theme-tokens.css', 'src/styles/home-style.css', 'src/styles/home-shared.css',
  'src/styles/site.css', 'src/styles/style.css', 'src/components/home/home-hero-slider.css',
  'src/features/explore/explore-page.css', 'src/features/profile/profile-page.css',
  'src/features/maze/styles/maze-site.css', 'src/features/maze/styles/maze-unify.css',
  'src/features/maze/styles/maze-theme.css', 'src/features/maze/styles/create-game.css',
  'src/features/maze/styles/lobby.css',
].map((file) => [file, fs.readFileSync(path.join(root, file), 'utf8')]);
for (const [file, source] of activeCssSources) {
  if (/\.live-(?:bar|bar-menu|menu-btn|feed-panel|feed-rail-scroll|feed-state|card)(?:[\s:#.\[]|$)|\.holder-live-card-vote|@keyframes\s+ping-dot/.test(source)) {
    console.error(`[layout] retired Live Feed CSS remains in ${file}.`);
    process.exit(1);
  }
  if (/\.holders-(?:box|header|title|count|content|columns|list|status)|\.holder-row|\.nav-more-menu|\.nav-more-dropdown/.test(source)) {
    console.error(`[layout] retired Holders/More CSS remains in ${file}.`);
    process.exit(1);
  }
}

const retiredSources = [
  'start.js', 'server.js', 'shared/api-routes.json',
].map((file) => [file, fs.readFileSync(path.join(root, file), 'utf8')]);
for (const [file, source] of retiredSources) {
  if (/tx-engine|verify-engine|Transaction Engine|Verify Engine|Last 100 Purchases|liveFeedBuyers|latestBuyers|txState|lastPurchaseBlockTime|holder-purchases-value|holder-last-Purchases-value|HoldersSnapshotService|holdersTop|holdersSummary|Holder Engine|holder-engine/i.test(source)) {
    console.error(`[layout] removed transaction/purchase/Holders feature is still referenced: ${file}`);
    process.exit(1);
  }
}

