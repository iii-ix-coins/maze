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
  'public/css', 'public/css/images', 'public/fonts/nunito', 'engines', 'shared', 'tests',
  'src/main.tsx', 'src/app/App.tsx', 'src/features/home/HomePage.tsx', 'src/styles/theme-tokens.css',
  'src/components/layout/SiteChromeHosts.tsx',
  'src/components/layout/RouteScrollbar.tsx',
  'src/components/navigation/SiteNavigation.tsx',
  'src/components/access/PageAccessGate.tsx', 'src/components/access/page-access-gate.css',
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
const nunitoWeights = [200, 300, 400, 600, 700, 800, 900];
const nunitoDirectory = path.join(root, 'public/fonts/nunito');
if (!fs.existsSync(path.join(nunitoDirectory, 'OFL.txt'))) {
  console.error('[layout] Nunito SIL Open Font License 1.1 file is missing.');
  process.exit(1);
}
const nunitoStyle = fs.readFileSync(path.join(root, 'src/styles/style.css'), 'utf8');
const nunitoHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const weight of nunitoWeights) {
  for (const extension of ['woff2', 'woff']) {
    const fontPath = path.join(nunitoDirectory, `nunito-${weight}-normal.${extension}`);
    if (!fs.existsSync(fontPath) || fs.statSync(fontPath).size === 0) {
      console.error(`[layout] missing Nunito ${weight} ${extension} webfont: ${path.relative(root, fontPath)}`);
      process.exit(1);
    }
  }
  if (!nunitoStyle.includes(`font-weight: ${weight};`) || !nunitoStyle.includes(`/fonts/nunito/nunito-${weight}-normal.woff2`)) {
    console.error(`[layout] global Nunito @font-face is missing weight ${weight}.`);
    process.exit(1);
  }
}
const retiredFontDirectories = ['public/css/font', 'src/features/maze/styles/font'];
for (const retiredFontDirectory of retiredFontDirectories) {
  if (fs.existsSync(path.join(root, retiredFontDirectory))) {
    console.error(`[layout] retired Montserrat font assets remain: ${retiredFontDirectory}`);
    process.exit(1);
  }
}
const typographySources = [
  'src/styles/style.css', 'src/styles/home-shared.css', 'src/components/home/home-hero-slider.css',
  'src/features/home/game-feed.css', 'src/features/maze/styles/maze-site.css',
  'src/features/maze/styles/create-game.css', 'src/features/maze/ui/create-game/maze-stage.ts',
  'src/platform/wallet/appkit.ts', 'src/platform/wallet/walletModalVisuals.ts',
].map((file) => [file, fs.readFileSync(path.join(root, file), 'utf8')]);
for (const [file, source] of typographySources) {
  if (/Montserrat/i.test(source)) {
    console.error(`[layout] retired Montserrat reference remains in ${file}.`);
    process.exit(1);
  }
}
if (!nunitoHtml.includes('/fonts/nunito/nunito-400-normal.woff2') || !nunitoHtml.includes('/fonts/nunito/nunito-700-normal.woff2')) {
  console.error('[layout] index.html must preload the common Nunito body and heading weights.');
  process.exit(1);
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
const routeScrollbarSource = fs.readFileSync(path.join(root, 'src/components/layout/RouteScrollbar.tsx'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'src/app/App.tsx'), 'utf8');
const routerSource = fs.readFileSync(path.join(root, 'src/app/router.tsx'), 'utf8');
const motionStyles = fs.readFileSync(path.join(root, 'src/styles/style.css'), 'utf8');
if (!chromeSource.includes('<SiteNavigation />') || chromeSource.includes('<InteractionBar')) {
  console.error('[layout] SiteChromeHosts must mount only the shared SiteNavigation chrome.');
  process.exit(1);
}
if (
  !appSource.includes('<SiteChromeHosts />') ||
  appSource.indexOf('<SiteChromeHosts />') > appSource.indexOf('<AppRouter />') ||
  routerSource.includes('<SiteChromeHosts') ||
  !chromeSource.includes('memo(function SiteChromeHosts') ||
  /body\.page-loaded[^{}]*#site-header|body\.page-loaded[^{}]*#site-topbar/.test(motionStyles) ||
  /maze-header-entered|maze-site-brand-entered|maze-brand-entered/.test(chromeSource + motionStyles) ||
  !siteCssEntry.includes('view-transition-name: site-route-content;') ||
  !motionStyles.includes('::view-transition-old(site-route-content)') ||
  !motionStyles.includes('::view-transition-new(site-route-content)') ||
  !motionStyles.includes('data-ui-view-transition=\"scoped\"') ||
  !motionStyles.includes('data-site-route-exiting=\"true\"')
) {
  console.error('[layout] Header, dock and outer content frame must persist; route motion must be scoped to the inner page surface.');
  process.exit(1);
}
const mazeMenuSource = fs.readFileSync(path.join(root, 'src/features/maze/ui/react/MazeMenu.tsx'), 'utf8');
const mazeBootSource = fs.readFileSync(path.join(root, 'src/features/maze/engine/boot.ts'), 'utf8');
const menuBootDecisionIndex = Math.max(
  mazeBootSource.indexOf('if (saved) restoreGame(saved);'),
  -1,
);
const menuEngineReadyIndex = mazeBootSource.indexOf("window.dispatchEvent(new Event('maze:engine-ready'));");
const menuVisibilityIsBootGated =
  mazeMenuSource.includes("document.documentElement.dataset.mazeEngineReady === 'true'") &&
  mazeMenuSource.includes("window.addEventListener('maze:engine-ready', handleEngineReady)") &&
  mazeMenuSource.includes('if (!engineReady) return;') &&
  mazeMenuSource.includes("app?.classList.toggle('in-menu', state.visible)") &&
  /closest<HTMLElement>\('#mazeApp'\)\?\.classList\.remove\('in-menu'\)/.test(mazeMenuSource) &&
  menuBootDecisionIndex >= 0 &&
  menuEngineReadyIndex > menuBootDecisionIndex;
if (!menuVisibilityIsBootGated) {
  console.error('[layout] Maze menu must preserve the initial in-menu frame state until the engine completes its first menu/game decision.');
  process.exit(1);
}
const mazeCreateStyles = fs.readFileSync(path.join(root, 'src/features/maze/styles/create-game.css'), 'utf8');
const mazeLegacyStyles = fs.readFileSync(path.join(root, 'src/features/maze/styles/maze-site.css'), 'utf8');
const createFrameShowRule = mazeCreateStyles.match(/(?:^|\n)\s*\.cg\.show\s*\{([^}]*)\}/);
if (
  !createFrameShowRule ||
  /animation\s*:/i.test(createFrameShowRule[1]) ||
  /animation\s*:\s*cgFade\b/.test(mazeCreateStyles + mazeLegacyStyles) ||
  /@keyframes\s+cgFade\b/.test(mazeCreateStyles + mazeLegacyStyles)
) {
  console.error('[layout] The shared Create/Rooms/Live content surface must not entrance-animate.');
  process.exit(1);
}

const headerBalanceSource = fs.readFileSync(path.join(root, 'src/components/layout/HeaderCoinBalance.tsx'), 'utf8');
const tokenBalanceService = fs.readFileSync(path.join(root, 'shared/services/SolanaTokenBalanceService.js'), 'utf8');
const tokenBalanceServer = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const headerApiManifest = JSON.parse(fs.readFileSync(path.join(root, 'shared/api-routes.json'), 'utf8'));
if (
  !chromeSource.includes('<HeaderCoinBalance />') ||
  !headerBalanceSource.includes('maze:wallet-snapshot') ||
  !headerBalanceSource.includes('API_PATHS.tokenBalance') ||
  !tokenBalanceService.includes('getParsedTokenAccountsByOwner') ||
  !tokenBalanceServer.includes('API_PATHS.tokenBalance') ||
  !tokenBalanceServer.includes('process.env.MINT_ADDRESS') ||
  !tokenBalanceServer.includes('process.env.SOLANA_RPC_URL') ||
  headerApiManifest.tokenBalance !== '/api/token-balance'
) {
  console.error('[layout] header coin balance must use the shared wallet snapshot and server-side mint-balance API.');
  process.exit(1);
}
const siteChromeCss = fs.readFileSync(path.join(root, 'src/styles/site.css'), 'utf8');
const hasSharedFrameGeometry = [
  '--site-frame-width:',
  '--site-header-height:',
  'width: var(--site-frame-width)',
  '.route-page {',
  '.route-page::before',
  '#site-topbar::before',
].every((token) => siteChromeCss.includes(token));
if (
  !chromeSource.includes('<header id="site-topbar"') ||
  !chromeSource.includes('<div id="site-header"') ||
  !chromeSource.includes('id="site-brand"') ||
  !hasSharedFrameGeometry
) {
  console.error('[layout] the topbar, route content and navigation must use the shared three-frame geometry.');
  process.exit(1);
}
const routeScrollRule = siteChromeCss.match(/\.route-page\s*>\s*\.feature-page-shell\s*\{([^}]*)\}/s)?.[1] ?? '';
const routeFrameRule = siteChromeCss.match(/\.route-page\s*\{([^}]*)\}/s)?.[1] ?? '';
const routeFrameStrokeRule = siteChromeCss.match(/\.route-page::before\s*\{([^}]*)\}/s)?.[1] ?? '';
if (/body:not\(\.in-menu\)\s+\.route-page/.test(siteChromeCss)) {
  console.error('[layout] normal site frame geometry must not depend on Maze body-mode state.');
  process.exit(1);
}
const mobileHeaderRule = siteChromeCss.match(/@media \(max-width: 720px\)\s*\{[\s\S]*?#site-header\s*\{([^}]*)\}/)?.[1] ?? '';
const routeFrameOpening = routerSource.match(/<div\s+className="route-page"[^>]*>/s)?.[0] ?? '';
const routeFrameIsPersistent = routeFrameOpening.includes('data-route-page={pathname}') && !routeFrameOpening.includes('key=') && /<Page key=\{pathname\} \/>/.test(routerSource) && /<main className="feature-page-shell"/.test(routerSource) && /<RouteScrollbar contentSelector=":scope > \.feature-page-shell" \/>/.test(routerSource) && /<MazeFrame active=\{isMazePage && isAuthenticated\}>/.test(routerSource);
if (!routeFrameIsPersistent) {
  console.error('[layout] the outer content frame must remain unkeyed while only the inner route component is keyed.');
  process.exit(1);
}
const routeDefinitionsSource = fs.readFileSync(path.join(root, 'src/app/routes.ts'), 'utf8');
if (
  !routeDefinitionsSource.includes('export function canSoftNavigateBetween') ||
  !navigationSourceHasBidirectionalBoundary()
) {
  console.error('[layout] every registered route, including Maze, must use the shared same-document SPA transition path.');
  process.exit(1);
}

function navigationSourceHasBidirectionalBoundary() {
  const navigation = fs.readFileSync(path.join(root, 'src/app/navigation.ts'), 'utf8');
  const routes = JSON.parse(fs.readFileSync(path.join(root, 'shared/site-routes.json'), 'utf8')).routes;
  const maze = routes.find((route) => route.id === 'maze');
  return navigation.includes('canSoftNavigateBetween(window.location.pathname, url.pathname)') &&
    navigation.includes('canSoftNavigateBetween(currentPath, nextPath)') &&
    navigation.includes('window.location.reload()') &&
    navigation.includes('confirmMazeRouteExit') &&
    navigation.includes('getDocumentTransitionSurface') &&
    maze?.soft === true && maze?.server === 'spa';
}
const navigationSource = fs.readFileSync(path.join(root, 'src/app/navigation.ts'), 'utf8');
const routeLoadersSource = fs.readFileSync(path.join(root, 'src/app/route-loaders.ts'), 'utf8');
const transitionCoordinatorSource = fs.readFileSync(path.join(root, 'src/platform/transition-coordinator.ts'), 'utf8');
const foundationStyles = fs.readFileSync(path.join(root, 'src/styles/style.css'), 'utf8');
if (
  !navigationSource.includes('startContentViewTransition') ||
  !navigationSource.includes('ROUTE_EXIT_DURATION_MS = 130') ||
  !navigationSource.includes('cancelPendingRouteSwap') ||
  !navigationSource.includes('isRoutePageLoaded(destinationPage)') ||
  !navigationSource.includes('supportsSameDocumentViewTransitions()') ||
  !routeLoadersSource.includes('loadedRoutePages.add(\'home\')') ||
  !routerSource.includes('onAnimationEnd=') ||
  !routerSource.includes('dataset.siteRouteFallback') ||
  !routerSource.includes("event.animationName === 'site-route-content-enter'") ||
  !routerSource.includes("animatedSurface.matches('.route-page > .feature-page-shell > .route-view:not([hidden])')") ||
  !foundationStyles.includes('html[data-site-route-fallback=\"true\"]') ||
  !transitionCoordinatorSource.includes('prefersReducedMotion') ||
  !transitionCoordinatorSource.includes("root.dataset.uiViewTransition = 'scoped'") ||
  transitionCoordinatorSource.includes('startMazeMenuViewTransition') ||
  !transitionCoordinatorSource.includes('startThemeViewTransition') ||
  !transitionCoordinatorSource.includes('NAVIGATION_RECOVERY_DELAY_MS') ||
  !transitionCoordinatorSource.includes('animatePendingDocumentEntry') ||
  !foundationStyles.includes('navigation: none;')
) {
  console.error('[layout] route motion must use the shared scoped transition helper and a reduced-motion-aware CSS fallback.');
  process.exit(1);
}
const identitySource = fs.readFileSync(path.join(root, 'src/platform/identity/IdentityProvider.tsx'), 'utf8');
const mazeBootSourceForTransitions = fs.readFileSync(path.join(root, 'src/features/maze/engine/boot.ts'), 'utf8');
const transitionPageLoadingSource = fs.readFileSync(path.join(root, 'src/components/layout/PageLoadingProvider.tsx'), 'utf8');
const transitionMazeFrameSource = fs.readFileSync(path.join(root, 'src/features/maze/MazeFrame.tsx'), 'utf8');
if (
  !transitionCoordinatorSource.includes('documentNavigationInFlight') ||
  !transitionCoordinatorSource.includes('restoreAfterCancelledNavigation') ||
  !transitionCoordinatorSource.includes('sessionStorage') ||
  !transitionCoordinatorSource.includes('prefersReducedMotion()') ||
  !identitySource.includes('commitWithContentTransition') ||
  !transitionMazeFrameSource.includes('finishPageLoading') ||
  !transitionMazeFrameSource.includes('startContentViewTransition') ||
  !transitionMazeFrameSource.includes('waitForDocumentEntryToFinish') ||
  !identitySource.includes('waitForDocumentEntryToFinish') ||
  !/if \(!S\.isGameOver\)\s*\{ event\.preventDefault\(\); event\.returnValue = ''; \}/.test(mazeBootSourceForTransitions) ||
  transitionCoordinatorSource.includes('allowMazeUnload') ||
  !transitionPageLoadingSource.includes('playPageEnter()') ||
  !siteCssEntry.includes('view-transition-name: site-route-content;') ||
  !fs.readFileSync(path.join(root, 'src/features/maze/styles/maze-unify.css'), 'utf8').includes('.maze-authenticated-boot')
) {
  console.error('[layout] Site/Maze transitions must share a single coordinator, reveal the authenticated boot surface before engine-ready, and keep the real document-unload guard without a Maze-only bypass.');
  process.exit(1);
}
if (
  fs.existsSync(path.join(root, 'src/platform/scoped-view-transition.ts')) ||
  fs.existsSync(path.join(root, 'src/platform/document-transition.ts'))
) {
  console.error('[layout] Legacy split transition helpers must not coexist with the single transition coordinator.');
  process.exit(1);
}
const htmlFoundationRules = [...foundationStyles.matchAll(/html\s*\{([^}]*)\}/g)].map((match) => match[1]);
if (
  !htmlFoundationRules.some((rule) => rule.includes('height: 100%') && rule.includes('overflow: hidden')) ||
  !/body\s*\{[^}]*overflow:\s*hidden/s.test(siteChromeCss) ||
  !/#root\s*\{[^}]*overflow:\s*hidden/s.test(siteChromeCss) ||
  !routeFrameRule.includes('position: fixed') ||
  !routeFrameRule.includes('overflow: hidden') ||
  !routeFrameStrokeRule.includes('z-index: 2') ||
  !siteChromeCss.includes('--site-frame-edge-gap: 7px') ||
  !mobileHeaderRule.includes('bottom: var(--site-frame-edge-gap)') ||
  !routeScrollRule.includes('height: 100%') ||
  !routeScrollRule.includes('overflow-y: auto') ||
  !routeScrollRule.includes('overscroll-behavior: contain') ||
  !routeScrollRule.includes('scrollbar-width: none') ||
  !routeScrollRule.includes('padding-inline-start: var(--site-frame-content-padding-start)') ||
  !routeScrollRule.includes('padding-inline-end: var(--site-frame-content-padding-end)') ||
  !routeScrollRule.includes('-ms-overflow-style: none') ||
  !siteChromeCss.includes('::-webkit-scrollbar {\n    display: none;') ||
  !siteChromeCss.includes('height: 60%') ||
  !siteChromeCss.includes('top: 50%') ||
  !siteChromeCss.includes('--site-frame-side-gutter:') ||
  !siteChromeCss.includes('--site-frame-content-inline-padding:') ||
  !siteChromeCss.includes('.route-scrollbar-track') ||
  !siteChromeCss.includes('.route-scrollbar-thumb') ||
  !siteChromeCss.includes('--site-scrollbar-content-gap: clamp(9px, 0.55vw, 18px)') ||
  !siteChromeCss.includes('--site-scrollbar-inset: clamp(9px, 0.55vw, 18px)') ||
  !routeScrollbarSource.includes('role="scrollbar"') ||
  !routeScrollbarSource.includes("case 'PageDown':") ||
  !routeScrollbarSource.includes('setPointerCapture') ||
  !routeScrollbarSource.includes('onWheel') ||
  !routeScrollbarSource.includes('ResizeObserver') ||
  !fs.readFileSync(path.join(root, 'src/app/router.tsx'), 'utf8').includes('<RouteScrollbar contentSelector=":scope > .feature-page-shell" />') ||
  !navigationSource.includes("'.route-page > .feature-page-shell'") ||
  navigationSource.includes('window.scrollTo') ||
  /html\s*\{[^}]*?(?:^|;)\s*scroll-behavior\s*:/ms.test(foundationStyles) ||
  /html\s*\{[^}]*?(?:^|;)\s*scroll-padding(?:-top)?\s*:/ms.test(foundationStyles) ||
  /(^|\n)\s*::-webkit-scrollbar\s*\{/m.test(foundationStyles) ||
  siteChromeCss.includes('@import "./header-scroll-scrim.css";') ||
  fs.existsSync(path.join(root, 'src/styles/header-scroll-scrim.css'))
) {
  console.error('[layout] normal site documents must stay viewport-locked; only the inner route content frame may scroll.');
  process.exit(1);
}
const mazeFrameCss = fs.readFileSync(path.join(root, 'src/features/maze/styles/maze-unify.css'), 'utf8');
const mazeThemeCss = fs.readFileSync(path.join(root, 'src/features/maze/styles/maze-theme.css'), 'utf8');
const mazePageSource = fs.readFileSync(path.join(root, 'src/features/maze/MazePage.tsx'), 'utf8');
const mazeFrameSource = fs.readFileSync(path.join(root, 'src/features/maze/MazeFrame.tsx'), 'utf8');
const mazeLayoutSource = fs.readFileSync(path.join(root, 'src/features/maze/engine/layout.ts'), 'utf8');
const mazeSessionSource = fs.readFileSync(path.join(root, 'src/features/maze/engine/session.ts'), 'utf8');
if (
  mazeFrameSource.includes('document.body.classList') ||
  mazeLayoutSource.includes('document.body.classList') ||
  mazeSessionSource.includes('document.body.classList') ||
  !mazeLayoutSource.includes("app?.classList.toggle('wide', wide)") ||
  !mazeSessionSource.includes("document.getElementById('mazeApp')?.classList.toggle('spectating', S.spectating)") ||
  !mazeLayoutSource.includes("surface?.classList.contains('feature-page-shell') === true") ||
  !mazeLayoutSource.includes('surface.clientHeight - verticalPadding') ||
  !mazeLayoutSource.includes('appBounds?.width')
) {
  console.error('[layout] Game-only layout state must stay on #mazeApp and Engine sizing must use the shared route viewport, never document.body or menu content height.');
  process.exit(1);
}
const createGameCss = fs.readFileSync(path.join(root, 'src/features/maze/styles/create-game.css'), 'utf8');
const lobbyCss = fs.readFileSync(path.join(root, 'src/features/maze/styles/lobby.css'), 'utf8');
const legacyMazeCss = fs.readFileSync(path.join(root, 'src/features/maze/styles/maze-site.css'), 'utf8');
const mazeHostPresentationIsIsolated =
  legacyMazeCss.includes('.maze-app .game-container button:where') &&
  legacyMazeCss.includes('.maze-app .game-container h1') &&
  !legacyMazeCss.includes('.maze-app button:where') &&
  !legacyMazeCss.includes('.maze-app h1 {') &&
  !legacyMazeCss.includes('.maze-app:not(.wide) h1') &&
  !legacyMazeCss.includes('min-height: 100vh') &&
  !legacyMazeCss.includes('padding-inline: 8px') &&
  mazeThemeCss.includes(':is(.game-container, .cg, .lb) :where(input, textarea, select, button, [role="button"])') &&
  !mazeThemeCss.includes('.maze-app :where(input, textarea, select, button, [role="button"])') &&
  !/html\[data-theme="(?:light|dark|grass)"\] \.maze-app\s*\{[^}]*background\s*:/s.test(mazeThemeCss) &&
  !mazeFrameCss.includes('overscroll-behavior') &&
  !mazeFrameSource.includes('route-page--maze-gameplay') &&
  !mazeFrameCss.includes('#mazeApp.maze-app {') &&
  !siteChromeCss.includes('.route-page > .feature-page-shell > #mazeApp {');
if (!mazeHostPresentationIsIsolated) {
  console.error('[layout] Maze styles must not leak legacy shell, heading, theme or button rules onto shared Site components; only game-owned controls may use Engine presentation.');
  process.exit(1);
}
const mazeMenuCssSources = [mazeFrameCss, createGameCss, lobbyCss, legacyMazeCss];
const createGameControllerSource = fs.readFileSync(path.join(root, 'src/features/maze/ui/create-game/create-game.ts'), 'utf8');
const mazeMenuPresentationSource = fs.readFileSync(path.join(root, 'src/features/maze/ui/react/MazeMenu.tsx'), 'utf8');
if (
  !createGameControllerSource.includes('onViewTransition') ||
  /(document|window|HTMLElement|Element|querySelector|addEventListener)/.test(createGameControllerSource) ||
  !mazeMenuPresentationSource.includes('startContentViewTransition(update)') ||
  mazeMenuPresentationSource.includes('dataset.mazeTabExiting') ||
  mazeMenuPresentationSource.includes('dataset.mazeTabEntering') ||
  legacyMazeCss.includes('view-transition-name: maze-menu-content;') ||
  legacyMazeCss.includes('maze-menu-view-exit 120ms') ||
  legacyMazeCss.includes('maze-menu-view-enter 190ms') ||
  transitionCoordinatorSource.includes('startMazeMenuViewTransition') ||
  !legacyMazeCss.includes('transform 260ms cubic-bezier(.22, .78, .24, 1)')
) {
  console.error('[layout] Create/Rooms/Live tab motion must be scoped to the active panel and preserve the mounted Maze UI.');
  process.exit(1);
}
const hasNestedMenuScroller = mazeMenuCssSources.some((css) => {
  const blocks = css.match(/[^{}]+\{[^{}]*\}/g) ?? [];
  return blocks.some((block) => {
    const opening = block.indexOf('{');
    const selector = block.slice(0, opening);
    const declarations = block.slice(opening + 1, -1);
    if (!/(?:\.cg-steps|\.lb-members)\b/.test(selector)) return false;
    return /overflow(?:-y)?\s*:\s*(?:auto|scroll)\b/.test(declarations);
  });
});
const mazeFrameVerticalScrollCount = (mazeFrameCss.match(/overflow-y\s*:\s*auto/g) ?? []).length;
const routeViewRoots = [
  'src/features/home/HomePage.tsx',
  'src/features/explore/ExplorePage.tsx',
  'src/features/profile/ProfilePage.tsx',
  'src/features/maze/MazeHubPage.tsx',
  'src/components/layout/NotFoundPage.tsx',
].map((file) => fs.readFileSync(path.join(root, file), 'utf8'));
const routeViewRootsAreUniform =
  routeViewRoots.every((source) => /<section\s+className=\"route-view\b/.test(source)) &&
  (routerSource.match(/<main\b/g) ?? []).length === 1 &&
  /<section className=\"route-view route-view--access\">/.test(routerSource) &&
  /<section[\s\S]*className=\"route-view maze-app in-menu\"/.test(mazeFrameSource);
if (!routeViewRootsAreUniform) {
  console.error('[layout] Every registered destination must use the same direct section.route-view root under the one main content surface.');
  process.exit(1);
}
const sharedContentSurfaceIsUnified =
  /<main className="feature-page-shell"/.test(routerSource) &&
  /<RouteScrollbar contentSelector=":scope > \.feature-page-shell" \/>/.test(routerSource) &&
  /<MazeFrame active=\{isMazePage && isAuthenticated\}>[\s\S]*<\/MazeFrame>/.test(routerSource) &&
  routerSource.indexOf('<MazeFrame active={isMazePage && isAuthenticated}>') > routerSource.indexOf('<main className="feature-page-shell"') &&
  routeScrollRule.includes('height: 100%') &&
  routeScrollRule.includes('overflow-y: auto') &&
  routeScrollRule.includes('padding-inline-start: var(--site-frame-content-padding-start)') &&
  routeScrollRule.includes('padding-inline-end: var(--site-frame-content-padding-end)') &&
  siteChromeCss.includes('.route-page > .feature-page-shell > .route-view') &&
  /\.route-page > \.feature-page-shell > \.route-view\s*\{[^}]*display:\s*grid/s.test(siteChromeCss) &&
  !siteChromeCss.includes('.route-page > .feature-page-shell > #mazeApp {') &&
  !/<div className="route-view route-view--access">/.test(routerSource) &&
  routerSource.includes('className="route-page"') &&
  !routerSource.includes('route-page--home') &&
  !routerSource.includes('route-page--maze-hub') &&
  !routerSource.includes('route-page--maze`') &&
  !siteChromeCss.includes('.route-page--maze-gameplay') &&
  mazeFrameSource.includes('className="route-view maze-app in-menu"') &&
  mazeFrameSource.includes('id="mazeApp"') &&
  mazeFrameSource.includes('hidden={!active}') &&
  !mazeFrameSource.includes('<RouteScrollbar') &&
  !siteChromeCss.includes('.route-page > #mazeApp') &&
  !/(^|\n)\s*\.feature-page-shell\b/m.test(fs.readFileSync(path.join(root, 'src/styles/home-shared.css'), 'utf8')) &&
  !fs.readFileSync(path.join(root, 'src/styles/home-shared.css'), 'utf8').includes('route-page--home') &&
  !siteChromeCss.includes('body.in-menu') &&
  !mazeMenuPresentationSource.includes('document.body.classList.toggle') &&
  !mazeFrameSource.includes('document.body.classList') &&
  mazeLayoutSource.includes("app?.classList.toggle('wide', wide)") &&
  mazeLayoutSource.includes("app?.style.setProperty('--v', S.V + 'px')") &&
  fs.readFileSync(path.join(root, 'src/features/maze/engine-entry.ts'), 'utf8').includes("document.getElementById('mazeApp')?.style.removeProperty('--v')") &&
  !mazeLayoutSource.includes("document.documentElement.style.setProperty('--v'") &&
  mazeSessionSource.includes("document.getElementById('mazeApp')?.classList.toggle('spectating', S.spectating)") &&
  mazeFrameVerticalScrollCount === 0 &&
  !hasNestedMenuScroller &&
  mazeFrameCss.includes('--cg-gutter: 0px') &&
  mazeFrameCss.includes('--cg-pad-t: 0px') &&
  mazeFrameCss.includes('--cg-pad-b: 0px') &&
  mazeFrameCss.includes('--cg-available-height: calc(var(--site-frame-content-height) - var(--site-frame-content-padding) - var(--site-frame-content-padding))') &&
  /#mazeApp\.maze-app\.in-menu > #createGame\.cg #cgViewCreate > \.cg-layout\s*\{[^}]*padding:\s*0/s.test(mazeFrameCss) &&
  /#mazeApp\.maze-app\.in-menu \.lb\s*\{[^}]*padding:\s*0/s.test(mazeFrameCss) &&
  !/padding-inline-(?:start|end):\s*var\(--site-frame-content-padding-(?:start|end)\)/.test(mazeFrameCss) &&
  mazeFrameCss.includes('--cg-max: 100%') &&
  /#mazeApp\.maze-app\.in-menu > #createGame\.cg\s*\{[^}]*position:\s*relative/s.test(mazeFrameCss) &&
  !/#mazeApp\.maze-app\.in-menu > #createGame\.cg\s*\{[^}]*position:\s*absolute/s.test(mazeFrameCss) &&
  mazeFrameCss.includes('overflow: visible') &&
  /#mazeApp\.maze-app:not\(\.in-menu\) > \.game-container\s*\{[^}]*height:\s*100%/s.test(mazeFrameCss) &&
  /\.maze-app \.cg-layout\s*\{/.test(legacyMazeCss) === false &&
  !/--cg-max:\s*1180px/.test(legacyMazeCss) &&
  !/--cg-(?:top-pad|pad-t|pad-b|tabs-h):/.test(legacyMazeCss) &&
  !/(?:\.cg-steps|\.lb-members)[^{}]*\{[^}]*overflow-y\s*:\s*(?:auto|scroll)/s.test(legacyMazeCss) &&
  !/position:\s*fixed|inset:\s*0/.test(createGameCss.match(/\.cg\s*\{([^}]*)\}/s)?.[1] ?? '') &&
  !/\.maze-app \.lb\s*\{[^}]*padding:\s*16px/s.test(legacyMazeCss) &&
  mazeThemeCss.includes('.maze-app .cg, .maze-app .lb { background: transparent;') &&
  !/\.lb\s*\{[^}]*max-width:\s*1180px/s.test(lobbyCss) &&
  !/\.lb-room-screen\s*\{[^}]*max-width:\s*1040px/s.test(lobbyCss) &&
  !/\.maze-app\s+\.cg-nav\s*\{[^}]*background:\s*var\(--surface-solid/s.test(createGameCss);
if (!sharedContentSurfaceIsUnified) {
  console.error('[layout] Every route must render through one shared Content Surface, one route-view contract and one vertical scroll owner; Maze may not create a parallel frame.');
  process.exit(1);
}

// The Engine host is mounted eagerly and persistently inside the universal content surface.
const mazeStoreSource = fs.readFileSync(path.join(root, 'src/features/maze/ui/react/maze-ui-store.ts'), 'utf8');
const indexHtmlSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const mazeFrameIsEagerAndPersistent =
  /import\s+\{\s*MazeFrame\s*\}\s+from\s+'\.\.\/features\/maze\/MazeFrame'/.test(routerSource) &&
  !/lazy\([^)]*MazeFrame/.test(routerSource) &&
  /<MazeFrame active=\{isMazePage && isAuthenticated\}>[\s\S]*<MazePage active=\{isMazePage && isAuthenticated\} authenticated=\{isAuthenticated\} \/>/.test(routerSource) &&
  routerSource.includes('hasMountedMaze') &&
  /id="mazeApp"/.test(mazeFrameSource) &&
  /hidden=\{!active\}/.test(mazeFrameSource) &&
  !/id=["']mazeApp["']/.test(mazePageSource) &&
  !/<main\b/.test(mazePageSource) &&
  !/import\s+['"]\.\/styles\/index\.css['"]/.test(mazeFrameSource) &&
  !/setInterval|\.click\(\)/.test(mazePageSource) &&
  /useLayoutEffect/.test(mazePageSource) &&
  mazePageSource.includes('mountMazeEngine') &&
  mazeStoreSource.includes('readInitialHomeView') &&
  /view:\s*initialHomeView/.test(mazeStoreSource) &&
  /html:not\(\[data-maze-engine-ready="true"\]\)[^{]*#mazeApp\.maze-app\s*>\s*#createGame\s*\{[^}]*visibility:\s*hidden/s.test(siteChromeCss) &&
  indexHtmlSource.includes('<div id="root"></div>') &&
  !indexHtmlSource.includes('maze-root') &&
  !indexHtmlSource.includes('mazeRoutePath') &&
  !indexHtmlSource.includes('@maze-route-paths');
if (!mazeFrameIsEagerAndPersistent) {
  console.error('[layout] The Maze Engine host must remain persistent inside the same route-view tree and must not have a second document root.');
  process.exit(1);
}

// Logged-out pages use the shared Access Surface and never mount protected feature trees.
const accessGateSource = fs.readFileSync(path.join(root, 'src/components/access/PageAccessGate.tsx'), 'utf8');
const accessGateCss = fs.readFileSync(path.join(root, 'src/components/access/page-access-gate.css'), 'utf8');
const accessGateIdentitySource = fs.readFileSync(path.join(root, 'src/platform/identity/IdentityProvider.tsx'), 'utf8');
const pageLoadingSource = fs.readFileSync(path.join(root, 'src/components/layout/PageLoadingProvider.tsx'), 'utf8');
const mazeFrameTransitionSource = fs.readFileSync(path.join(root, 'src/features/maze/MazeFrame.tsx'), 'utf8');
const siteChromeHostsSource = fs.readFileSync(path.join(root, 'src/components/layout/SiteChromeHosts.tsx'), 'utf8');
const authGateIsFailClosed =
  routerSource.includes('!isAuthenticated ? (') &&
  routerSource.includes('<Page key={pathname} />') &&
  routerSource.includes('<PageAccessGate') &&
  !mazeFrameSource.includes('PageAccessGate') &&
  routerSource.includes('isMazePage ? getRequestedMazeAccessPage() : ACCESS_PAGE_BY_ROUTE[route.id]') &&
  accessGateSource.includes("status === 'authenticating'") &&
  accessGateSource.includes('site-access-panel') &&
  accessGateSource.includes('PLATFORM_PILLARS') &&
  accessGateSource.includes('<WalletConnectButton variant="primary" />') &&
  !/access-preview-|PreviewHeader|PreviewRoom|PreviewMaze/.test(accessGateSource + accessGateCss) &&
  !/fetch\s*\(|API_PATHS|axios\./.test(accessGateSource) &&
  accessGateCss.includes('.site-access-panel') &&
  accessGateCss.includes('prefers-reduced-motion: reduce') &&
  accessGateIdentitySource.includes("if (!result.authenticated || !result.user)") &&
  accessGateIdentitySource.includes('navigateTo(returnTo)') &&
  pageLoadingSource.includes("identityStatus === 'authenticated'") &&
  pageLoadingSource.includes("identityStatus === 'checking' && !identityWaitExpired") &&
  siteChromeHostsSource.includes('const { isAuthenticated } = useIdentity()') &&
  siteChromeHostsSource.includes('{isAuthenticated ? <HeaderCoinBalance /> : null}');
if (!authGateIsFailClosed) {
  console.error('[layout] Guests must stay outside protected feature trees until the server confirms wallet identity; every route must use the shared Access Surface.');
  process.exit(1);
}
// Identity bootstrap: the server embeds the session snapshot in the HTML, so a
// signed-in visitor's first render is never the guest Gate or a "checking" state.
const identityProviderBootstrapSource = fs.readFileSync(path.join(root, 'src/platform/identity/IdentityProvider.tsx'), 'utf8');
const serverEntrySource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const identityBootstrapIsWired =
  identityProviderBootstrapSource.includes('readIdentityBootstrap') &&
  identityProviderBootstrapSource.includes('isSameSession(bootstrap, response)') &&
  serverEntrySource.includes('function sendSiteDocument') &&
  serverEntrySource.includes("res.setHeader('Cache-Control', 'no-store')") &&
  serverEntrySource.includes("res.vary('Cookie')") &&
  !/res\.sendFile\(SITE_DIST_INDEX\);\s*\}\);\s*\n\s*\napp\.get\(\s*HOME_DOCUMENT_PATH/.test(serverEntrySource);
if (!identityBootstrapIsWired) {
  console.error('[layout] Every site document response must embed the server-verified identity snapshot (no-store, Vary: Cookie) and IdentityProvider must start from it.');
  process.exit(1);
}
const rootThemeStyles = fs.readFileSync(path.join(root, 'src/styles/theme-tokens.css'), 'utf8');
const siteButtonStyles = fs.readFileSync(path.join(root, 'src/styles/style.css'), 'utf8');
if (
  rootThemeStyles.includes('html[data-theme] .maze-app :where') ||
  rootThemeStyles.includes('.cg-panel,.cg-card,.cg-step,.lb-card') ||
  siteButtonStyles.includes('maze-menu-content') ||
  siteButtonStyles.includes('data-maze-tab-exiting') ||
  siteButtonStyles.includes('--maze-enter-') ||
  siteButtonStyles.includes('maze-dropdown-') ||
  !siteButtonStyles.includes('--site-route-enter-duration') ||
  !siteButtonStyles.includes('site-wallet-menu-out') ||
  !siteButtonStyles.includes('.nav-wallet-button.is-primary') ||
  !siteButtonStyles.includes('.nav-wallet-button.is-primary > span') ||
  mazeFrameSource.includes('app.dataset.theme') ||
  mazeFrameSource.includes('site:themechange')
) {
  console.error('[layout] The document theme and shared site button styles must be the only platform-level presentation source; Maze may not override shared descendants or own a second tab transition system.');
  process.exit(1);
}

const walletButtonSource = fs.readFileSync(path.join(root, 'src/platform/wallet/WalletConnectButton.tsx'), 'utf8');
const walletTeardownSource = fs.readFileSync(path.join(root, 'src/platform/wallet/wallet-session-teardown.ts'), 'utf8');
const walletTeardownTests = fs.readFileSync(path.join(root, 'src/platform/wallet/wallet-session-teardown.test.ts'), 'utf8');
if (
  !walletButtonSource.includes('Disconnect & log out') ||
  !walletButtonSource.includes('logoutAfterWalletChange') ||
  !walletButtonSource.includes('runWalletSessionTeardown') ||
  !walletButtonSource.includes('endError.sessionRevoked') ||
  walletButtonSource.includes('navigateDocument') ||
  walletButtonSource.includes('isMazeDocumentPath') ||
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
  if (html.includes('/* @maze-route-paths */') || html.includes('maze-root')) {
    console.error(`[layout] Route-specific Maze document roots or pre-paint bootstraps must not return: ${page}`);
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
  'src/features/home/game-feed-api.ts',
  'src/features/maze/MazeHubPage.tsx',
  'src/features/maze/MazePage.tsx',
  'src/components/layout/SiteChromeHosts.tsx',
  'src/components/navigation/SiteNavigation.tsx',
  'src/components/access/PageAccessGate.tsx', 'src/components/access/page-access-gate.css',
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
if (!routerSource.includes('const MazePage = lazy(loadMazePage);') || !routerSource.includes('loadMazePage')) {
  console.error('[layout] MazePage must be loaded through the centralized route-level lazy loader.')
  process.exit(1);
}
const mazeEngineEntry = fs.readFileSync(path.join(root, 'src/features/maze/engine-entry.ts'), 'utf8');
const mazeEngineBoot = fs.readFileSync(path.join(root, 'src/features/maze/engine/boot.ts'), 'utf8');
const mazeEngineFrame = fs.readFileSync(path.join(root, 'src/features/maze/engine/frame.ts'), 'utf8');
const mazeSocketClient = fs.readFileSync(path.join(root, 'src/features/maze/net/multiplayer-client.ts'), 'utf8');
const mazeLobbyHub = fs.readFileSync(path.join(root, 'src/features/maze/ui/lobby/lobby-hub.ts'), 'utf8');
const mazeRuntimeTimers = fs.readFileSync(path.join(root, 'src/features/maze/engine/runtime-timers.ts'), 'utf8');
if (
  !mazePageSource.includes('mountMazeEngine') ||
  !mazeEngineEntry.includes('new AbortController()') ||
  !mazeEngineEntry.includes('controller.abort()') ||
  !mazeEngineEntry.includes('multiplayerClient.disconnect(false)') ||
  !mazeEngineEntry.includes('clearEngineTimeouts()') ||
  !mazeRuntimeTimers.includes('pendingTimers') ||
  !mazeRuntimeTimers.includes('window.clearTimeout(timer)') ||
  !mazeEngineBoot.includes('cancelAnimationFrame(activeFrameId)') ||
  !mazeEngineBoot.includes("dataset.mazeActiveRun = (!S.isGameOver && !S.spectating) ? 'true' : 'false'") ||
  !mazeSocketClient.includes('socketController.abort()') ||
  !mazeSocketClient.includes('clearTimeout(this.reconnectTimer)') ||
  !mazeLobbyHub.includes('this.unsubscribeStore?.()') ||
  !mazeLobbyHub.includes('this.busyTimers.clear()') ||
  !mazeLobbyHub.includes("this.phase = 'idle'") ||
  !mazeLobbyHub.includes('this.watching = false') ||
  !mazeLobbyHub.includes('mazeUiStore.patch({ busyRoomIds: [], copied: false })') ||
  !mazeLobbyHub.includes('mazeUiStore.unregisterActions(this.registeredActions)') ||
  !mazeEngineBoot.includes('S.multiplayerSession || S.spectating') ||
  !mazeEngineBoot.includes("if (lobbyHub.phase !== 'idle') lobbyHub.leaveRoom()")
) {
  console.error('[layout] Maze Engine must expose an idempotent mount/dispose lifecycle and release its listeners, RAF loop, WebSocket, reconnect/timer and store subscriptions.');
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
if (
  featureRouter.includes("if (route?.id === 'maze') return null;") ||
  featureRouter.includes('createPortal') ||
  !featureRouter.includes('<main className="feature-page-shell"') ||
  !featureRouter.includes('<MazeFrame active={isMazePage && isAuthenticated}>') ||
  featureRouter.includes('MazeRouteShell') ||
  !siteCssEntry.includes('.route-scrollbar[data-visible="false"]') ||
  !siteCssEntry.includes('visibility: hidden;')
) {
  console.error('[layout] Maze and Site routes must use one shared content surface, and scrollbars without a target must stay hidden.');
  process.exit(1);
}
const siteRoutes = JSON.parse(fs.readFileSync(path.join(root, 'shared/site-routes.json'), 'utf8')).routes;
const mazeHubRoute = siteRoutes.find((route) => route.id === 'maze-hub');
if (!mazeHubRoute || !mazeHubRoute.paths.includes('/maze') || mazeHubRoute.server !== 'spa' || mazeHubRoute.navKey !== 'maze-hub') {
  console.error('[layout] Maze Hub must remain a distinct soft-navigation SPA route at /maze.');
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
  !navigationComponent.includes("label: 'Maze'") ||
  !navigationComponent.includes("getSiteRoutePath('maze-hub')") ||
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
const headerThemeIndex = chromeComponent.indexOf('<ThemeSwitcher />');
const headerBalanceIndex = chromeComponent.indexOf('<HeaderCoinBalance />');
const createIndex = navigationComponent.indexOf('href={MAZE_VIEW_URLS.create}');
if (
  !chromeComponent.includes('id="site-brand"') ||
  chromeComponent.includes('id="site-controls"') ||
  chromeComponent.includes('GameViewSwitcher') ||
  headerThemeIndex < 0 ||
  headerBalanceIndex <= headerThemeIndex ||
  navigationComponent.includes('<ThemeSwitcher />') ||
  !themeSwitcherComponent.includes('theme-toggle--header') ||
  themeSwitcherComponent.includes('THEME_MARKS') ||
  !themeSwitcherComponent.includes('data-select-theme={item}') ||
  !themeSwitcherComponent.includes('aria-label={`${THEME_LABELS[item]} theme`}') ||
  themeSwitcherComponent.includes('THEME_ICONS') ||
  createIndex < 0 ||
  notificationsIndex <= createIndex ||
  !navigationComponent.includes('No notifications yet') ||
  navigationComponent.includes('nav-dock-label') ||
  navigationComponent.includes('nav-dock-create-icon') ||
  navigationComponent.includes("tone=\"create\"") ||
  !navigationComponent.includes('<span className="nav-dock-icon" aria-hidden="true"><NavIcon name="create" /></span>') ||
  navigationComponent.includes('MoreMenu') ||
  navigationComponent.includes('Holders') ||
  !navigationComponent.includes("'/css/images/nav/nav-maze.svg'") ||
  !navigationComponent.includes("'/css/images/nav/nav-home.svg'") ||
  !navigationComponent.includes("'/css/images/nav/nav-explore.svg'") ||
  !navigationComponent.includes("'/css/images/nav/nav-create.svg'") ||
  !navigationComponent.includes("'/css/images/nav/nav-notifications.svg'") ||
  !navigationComponent.includes("'/css/images/nav/nav-profile.svg'")
) {
  console.error('[layout] Brand, centered header theme, right token balance and six Dock actions must use their assigned chrome regions.');
  process.exit(1);
}
if (
  !profileComponent.includes("status === 'anonymous' || status === 'authenticating' || isAuthenticated") ||
  !profileComponent.includes('<WalletConnectButton compactAuthenticated />') ||
  (profileComponent.match(/<WalletConnectButton\b/g) ?? []).length !== 1 ||
  !profileComponent.includes('profile-connect-stage') ||
  !profileComponent.includes('profile-account-actions') ||
  !walletComponent.includes('compactAuthenticated ?') ||
  !walletComponent.includes('is-compact-account') ||
  !walletComponent.includes("'[role=\"menuitem\"]:not(:disabled)'") ||
  !walletComponent.includes("event.key === 'ArrowDown'") ||
  !walletComponent.includes("event.key === 'ArrowUp'")
) {
  console.error('[layout] Profile must keep one wallet control mounted across anonymous/sign-in/authenticated states and expose an accessible authenticated account menu.');
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
  !identityProviderSource.includes('navigateTo(returnTo)') || !identityProviderSource.includes('window.location.pathname') ||
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
if (!packageManifest.scripts?.['test:identity']?.includes('tests/identity/identity-routes.test.cjs') || !packageManifest.scripts?.['test:identity']?.includes('tests/identity/identity-bootstrap.test.cjs')) {
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
if (!mazeRoute?.paths.includes('/maze.html') || !mazeRoute.paths.includes('/play') || mazeRoute.server !== 'spa' || !mazeRoute.soft) {
  console.error('[layout] Maze aliases must be declared once as soft routes served by the shared SPA document.');
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
if (!profileRouter.includes('resolveSiteRoute') || !profileNavigation.includes('canSoftNavigateBetween') || !profileServer.includes("require('./shared/site-routes.json')")) {
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
const headerThemeHostRule = sharedSiteStyles.match(/\.site-topbar-theme-slot\s*\{([^}]*)\}/s)?.[1] ?? '';
const headerThemeRule = sharedSiteStyles.match(/\.site-topbar-theme-slot \.theme-toggle--header\s*\{([^}]*)\}/s)?.[1] ?? '';
const headerThemeOptionRule = sharedSiteStyles.match(/\.site-topbar-theme-slot \.theme-toggle--header \.theme-toggle__option\s*\{([^}]*)\}/s)?.[1] ?? '';
const headerThemeActiveRule = sharedSiteStyles.match(/\.site-topbar-theme-slot \.theme-toggle--header \.theme-toggle__option\.is-active\s*\{([^}]*)\}/s)?.[1] ?? '';
const headerBalanceRule = sharedSiteStyles.match(/\.site-header-coin-balance\s*\{([^}]*)\}/s)?.[1] ?? '';
const notificationHostRule = sharedSiteStyles.match(/\.nav-notifications-menu\s*\{([^}]*)\}/s)?.[1] ?? '';
const dockRule = sharedSiteStyles.match(/\.nav\.site-bottom-nav\s*\{([^}]*)\}/s)?.[1] ?? '';
const dockInnerRule = sharedSiteStyles.match(/\.site-bottom-nav \.nav-inner\s*\{([^}]*)\}/s)?.[1] ?? '';
const dockLinksRule = sharedSiteStyles.match(/\.site-bottom-nav \.nav-links\s*\{([^}]*)\}/s)?.[1] ?? '';
const dockItemRule = sharedSiteStyles.match(/\.site-bottom-nav \.nav-link,\s*\.site-bottom-nav \.nav-notifications-trigger\s*\{([^}]*)\}/s)?.[1] ?? '';
const dockActiveRule = sharedSiteStyles.match(/\.site-bottom-nav \.nav-link\.active\s*\{([^}]*)\}/s)?.[1] ?? '';
const logoRule = sharedSiteStyles.match(/#site-brand \.nav-brand-logo\s*\{([^}]*)\}/s)?.[1] ?? '';
if (
  !sharedSiteStyles.includes('.nav.site-bottom-nav') ||
  !sharedSiteStyles.includes('.nav.site-bottom-nav::before') ||
  !sharedSiteStyles.includes('grid-template-columns: repeat(6, minmax(0, 1fr));') ||
  !sharedSiteStyles.includes('#site-brand') ||
  sharedSiteStyles.includes('.nav-dock-theme-slot') ||
  !headerThemeHostRule.includes('left: 50%;') ||
  !headerThemeRule.includes('display: flex;') ||
  !sharedSiteStyles.includes('.theme-toggle__option[data-select-theme="light"] {\n    background: #ffffff;') ||
  !sharedSiteStyles.includes('.theme-toggle__option[data-select-theme="dark"] {\n    background: #000000;') ||
  !sharedSiteStyles.includes('.theme-toggle__option[data-select-theme="grass"] {\n    background: #006400;') ||
  !headerThemeOptionRule.includes('width: var(--site-header-theme-button-size);') ||
  !sharedSiteStyles.includes('--site-header-theme-active-border: #ff0000;') ||
  !headerThemeActiveRule.includes('border: 3px solid var(--site-header-theme-active-border);') ||
  !headerBalanceRule.includes('right: 3px;') ||
  !headerBalanceRule.includes('font-variant-numeric: tabular-nums;') ||
  !sharedSiteStyles.includes('--site-header-theme-button-size: 12px;') ||
  !sharedSiteStyles.includes('--site-header-theme-button-size: 19px;') ||
  !dockRule.includes('height: var(--site-dock-height);') ||
  !dockInnerRule.includes('height: 100%;') ||
  !dockInnerRule.includes('padding: 3px;') ||
  !dockLinksRule.includes('height: 100%;') ||
  !dockLinksRule.includes('grid-template-rows: minmax(0, 1fr);') ||
  !dockItemRule.includes('height: 100%;') ||
  !dockItemRule.includes('width: var(--site-dock-item-size);') ||
  !dockItemRule.includes('aspect-ratio: 1 / 1;') ||
  !dockItemRule.includes('transition: opacity 60ms ease, color 60ms ease;') ||
  sharedSiteStyles.includes('.site-bottom-nav .nav-link.active::after') ||
  sharedSiteStyles.includes('transform: translateX(-50%) scaleX(1);') ||
  !sharedSiteStyles.includes('.site-bottom-nav .nav-link:active') ||
  !sharedSiteStyles.includes('transform: none;') ||
  sharedSiteStyles.includes('.site-bottom-nav .nav-link.active .nav-dock-icon') ||
  sharedSiteStyles.includes('transform: scale(.94);') ||
  !sharedSiteStyles.includes('prefers-reduced-motion: reduce') ||
  !dockItemRule.includes('opacity: 0.33;') ||
  !dockItemRule.includes('clip-path: none;') ||
  !dockItemRule.includes('-webkit-clip-path: none;') ||
  dockItemRule.includes('clip-path: polygon(') ||
  !dockActiveRule.includes('opacity: 1;') ||
  !dockActiveRule.includes('background: transparent;') ||
  !notificationHostRule.includes('height: 100%;') ||
  !logoRule.includes('width: var(--site-brand-width);') ||
  !logoRule.includes('height: var(--site-brand-height);') ||
  !sharedSiteStyles.includes('--site-dock-height: 45px;') ||
  !sharedSiteStyles.includes('--site-dock-height: 39px;') ||
  !sharedSiteStyles.includes('--site-dock-item-size: calc(var(--site-dock-height) - 6px);') ||
  !sharedSiteStyles.includes('--site-header-height: 30px;') ||
  !sharedSiteStyles.includes('--site-brand-width: 51px;') ||
  !sharedSiteStyles.includes('--site-brand-height: 20px;') ||
  sharedSiteStyles.includes('.nav-dock-create-icon') ||
  !sharedSiteStyles.includes('clip-path: polygon(') ||
  !sharedSiteStyles.includes('-webkit-clip-path: polygon(') ||
  sharedSiteStyles.includes('.site-bottom-nav .nav-link:hover') ||
  globalStyles.includes('.nav-link:not(:disabled):hover') ||
  !sharedSiteStyles.includes('.nav-notifications-panel') ||
  sharedSiteStyles.includes('#site-controls')
) {
  console.error('[layout] site.css must own the six-item dock, centered header theme selector, right token balance and Notifications panel.');
  process.exit(1);
}
if (/\.nav-inner\s*\{[^}]*grid-template-areas/s.test(globalStyles) || /\.nav-inner\s*\{[^}]*display:\s*grid/s.test(globalStyles) || /\.nav-inner\s*\{[^}]*display:\s*flex/s.test(globalStyles)) {
  console.error('[layout] style.css must not define a second nav-inner layout.');
  process.exit(1);
}

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
if (!viteConfig.includes("shared/site-routes.json") || !viteConfig.includes("@site-default-title") || viteConfig.includes('@maze-route-paths')) {
  console.error('[layout] Vite must use the shared route manifest for the default title without injecting a separate Maze document bootstrap.');
  process.exit(1);
}
if (!viteConfig.includes("main: path.resolve(root, 'index.html')")) {
  console.error('[layout] Vite production must emit one shared SPA document.');
  process.exit(1);
}

console.log('[layout] React routes, shared Maze SPA frame, explicit Engine lifecycle, unified identity transitions, header theme, wallet teardown and navigation verified.');

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
const mazeHubPage = fs.readFileSync(path.join(root, 'src/features/maze/MazeHubPage.tsx'), 'utf8');
const gameFeedPage = fs.readFileSync(path.join(root, 'src/features/home/HomePage.tsx'), 'utf8');
const gameFeedApi = fs.readFileSync(path.join(root, 'src/features/home/game-feed-api.ts'), 'utf8');
const marketSummary = fs.readFileSync(path.join(root, 'src/features/market/MarketSummary.tsx'), 'utf8');
if (
  !/<MarketSummary\b[^>]*\bshowTitle=\{false\}/.test(mazeHubPage) ||
  !mazeHubPage.includes('<HomeHeroSlider />') ||
  !gameFeedPage.includes('Live games') ||
  !gameFeedPage.includes('Open rooms') ||
  !gameFeedPage.includes('Just finished') ||
  !gameFeedPage.includes('fetchGameFeedSnapshot') ||
  !gameFeedApi.includes("new URL('/rooms', server.origin).href") ||
  !gameFeedApi.includes("cache: 'no-store'") ||
  gameFeedPage.includes('new WebSocket') ||
  homePage.includes('<MarketSummary') ||
  homePage.includes('HoldersPanel') ||
  marketSummary.includes('data-market="holders"') ||
  /HoldersSnapshotService|holdersTop|holdersSummary|getHolderState/.test(serverSource) ||
  /Holder Engine|holder-engine/.test(startSource)
) {
  console.error('[layout] Home must consume the existing read-only /rooms snapshot for live/open/recent feed cards; the former market summary and hero must live in Maze Hub, with no duplicate WebSocket or retired Holders feature.');
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
  'src/features/explore/explore-page.css', 'src/features/home/game-feed.css', 'src/features/maze/maze-hub.css', 'src/features/profile/profile-page.css',
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

