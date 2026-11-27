import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const warnings = [];

const read = (relativePath) => {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    errors.push(`Missing required source: ${relativePath}`);
    return '';
  }
  return fs.readFileSync(absolutePath, 'utf8');
};

const checkPublicSvg = (url, owner) => {
  if (!url.startsWith('/')) {
    errors.push(`${owner}: SVG source must be an absolute same-origin public URL: ${url}`);
    return;
  }
  const assetPath = path.join(root, 'public', url.replace(/^\/+/, ''));
  if (!fs.existsSync(assetPath)) errors.push(`${owner}: referenced SVG is missing: ${url}`);
};

const themeTokens = read('src/styles/theme-tokens.css');
const themedIconCss = read('src/styles/style.css');
const themedIconComponent = read('src/components/media/ThemedSvgIcon.tsx');
const navigation = read('src/components/navigation/SiteNavigation.tsx');
const themeSwitcher = read('src/components/navigation/ThemeSwitcher.tsx');
const brand = read('src/components/layout/SiteChromeHosts.tsx');
const loader = read('src/components/layout/PageLoader.tsx');
const hero = read('src/components/home/HomeHeroSlider.tsx');
const market = read('src/features/market/MarketSummary.tsx');
const gameIcons = read('src/features/maze/ui/create-game/icons.ts');
const avatar = read('src/components/account/UserAvatar.tsx');
const lobbyIcons = read('src/features/maze/ui/lobby/icons.ts');
const walletUi = read('src/platform/wallet/WalletConnectButton.tsx');
const explorePage = read('src/features/explore/ExplorePage.tsx');
const profilePage = read('src/features/profile/ProfilePage.tsx');
const mazeSiteCss = read('src/features/maze/styles/maze-site.css');
const createGameCss = read('src/features/maze/styles/create-game.css');
const siteCss = read('src/styles/site.css');
const gameFeedCss = read('src/features/home/game-feed.css');
const homeHeroCss = read('src/components/home/home-hero-slider.css');

for (const theme of ['light', 'dark', 'grass']) {
  const block = themeTokens.match(new RegExp(`html\\[data-theme=["']${theme}["']\\]\\s*\\{([\\s\\S]*?)\\n\\s*\\}`, 'm'))?.[1] ?? '';
  for (const token of ['--svg-icon-primary', '--svg-icon-secondary', '--svg-icon-accent', '--svg-icon-on-accent']) {
    if (!block.includes(token)) errors.push(`Theme ${theme} does not define ${token}.`);
  }
}

if (!themedIconCss.includes('.themed-svg-icon') || !themedIconCss.includes('mask-image: var(--themed-svg-source)') || !themedIconCss.includes('background-color: currentColor')) {
  errors.push('ThemedSvgIcon CSS must render source SVG geometry as a mask tinted by the root theme token.');
}
if (!themedIconComponent.includes('--themed-svg-source') || !themedIconComponent.includes('ThemedSvgIcon')) {
  errors.push('ThemedSvgIcon component is missing its central SVG source contract.');
}
if (themedIconComponent.includes("'create'") || themedIconCss.includes('data-tone="create"') || themeTokens.includes('--svg-icon-create')) {
  errors.push('The Create dock icon must use the same primary SVG pigment as all other navigation icons.');
}
if (themeTokens.includes('--create-button-gradient') || themeTokens.includes('--create-button-foreground') || siteCss.includes('nav-dock-create-icon')) {
  errors.push('The Create dock item must not retain its former special gold tile treatment.');
}
for (const token of [
  '--site-navigation-surface',
  '--home-hero-surface', '--home-hero-glow-surface',
  '--home-feed-panel-surface', '--home-feed-media-surface',
  '--home-feed-control-active-surface',
]) {
  const grassBlock = themeTokens.match(/html\[data-theme=["']grass["']\]\s*\{([\s\S]*?)\n\s*\}/m)?.[1] ?? '';
  if (!grassBlock.includes(`${token}: transparent`)) errors.push(`Grass theme must define ${token} as transparent.`);
}
if (!siteCss.includes('background: var(--site-navigation-surface)') || siteCss.includes('var(--site-navigation-active-surface)')) {
  errors.push('The dock frame must consume its semantic surface token while navigation buttons remain surface-free.');
}
const dockItemBlock = siteCss.match(/\.site-bottom-nav \.nav-link,\s*\.site-bottom-nav \.nav-notifications-trigger\s*\{([^}]*)\}/s)?.[1] ?? '';
const dockActiveBlock = siteCss.match(/\.site-bottom-nav \.nav-link\.active\s*\{([^}]*)\}/s)?.[1] ?? '';
if (!dockItemBlock.includes('opacity: 0.33;') || !dockItemBlock.includes('background: transparent;') || !dockActiveBlock.includes('opacity: 1;') || !dockActiveBlock.includes('background: transparent;')) {
  errors.push('Navigation controls must use opacity for state and remain transparent in every state.');
}
if (!gameFeedCss.includes('var(--home-feed-panel-surface)') || !gameFeedCss.includes('var(--home-feed-media-surface)') || !gameFeedCss.includes('var(--home-feed-control-active-surface)')) {
  errors.push('Game Feed panels, media and active controls must consume semantic Home surface tokens.');
}
if (!homeHeroCss.includes('background: var(--home-hero-surface)') || !homeHeroCss.includes('background: var(--home-hero-glow-surface)')) {
  errors.push('Home Hero and its glow must consume semantic Home surface tokens.');
}
if (!/--svg-icon-primary:\s*var\(--slime-lime\)/.test(themeTokens.match(/html\[data-theme=["']grass["']\]\s*\{([\s\S]*?)\n\s*\}/m)?.[1] ?? '')) {
  errors.push('Grass primary SVG pigment must use the bright slime-lime foreground.');
}
if (!hero.includes('<ThemedSvgIcon') || /<img[\s\S]{0,240}slide\.visualSrc/.test(hero)) {
  errors.push('Home hero SVG artwork must use ThemedSvgIcon rather than an untinted external img.');
}
if (!market.includes('<ThemedSvgIcon') || /<img[^>]+src="\/css\/images\/maze-coin-logo\.svg"/.test(market)) {
  errors.push('Maze coin mark must use the root-level ThemedSvgIcon contract.');
}

const sourceMaps = [
  ['SiteNavigation', navigation.match(/const NAV_ICON_SOURCES[\s\S]*?=\s*\{([\s\S]*?)\};/)?.[1] ?? ''],
];
if (themeSwitcher.includes('THEME_MARKS') || !themeSwitcher.includes('theme-toggle--header') || themeSwitcher.includes('THEME_ICONS') || !themeSwitcher.includes('data-select-theme={item}') || !themeSwitcher.includes('aria-label={`${THEME_LABELS[item]} theme`}') || !themeSwitcher.includes('<span aria-hidden="true"></span>')) {
  errors.push('ThemeSwitcher must use accessible, text-free color swatches in the shared header.');
}
for (const [owner, block] of sourceMaps) {
  const urls = [...block.matchAll(/:\s*'([^']+\.svg)'/g)].map((match) => match[1]);
  if (!urls.length) errors.push(`${owner} has no registered SVG icon sources.`);
  for (const url of urls) checkPublicSvg(url, owner);
}

for (const [owner, source] of [
  ['SiteChromeHosts', brand],
  ['PageLoader', loader],
  ['HomeHeroSlider', hero],
  ['MarketSummary', market],
]) {
  for (const match of source.matchAll(/src="(\/[^"']+\.svg)"|visualSrc:\s*'(\/[^']+\.svg)'/g)) {
    const url = match[1] ?? match[2];
    checkPublicSvg(url, owner);
  }
}

const iconFiles = [...gameIcons.matchAll(/file:\s*'([^']+\.svg)'/g)].map((match) => match[1]);
for (const filename of iconFiles) checkPublicSvg(`/maze-assets/assets/images/${filename}`, 'CreateGameIcons');

if (!brand.includes('<ThemedSvgIcon') || !loader.includes('<ThemedSvgIcon')) {
  errors.push('Brand wordmark and page-loader mark must use ThemedSvgIcon.');
}
if (!avatar.includes('color: var(--svg-icon-primary)') && !themedIconCss.includes('.user-avatar')) {
  errors.push('The fallback UserAvatar SVG must inherit the primary SVG theme token.');
}
for (const [owner, source] of [['Lobby inline icons', lobbyIcons], ['Wallet inline icons', walletUi], ['Explore inline icons', explorePage], ['Profile inline icons', profilePage]]) {
  if (!source.includes('theme-svg-inline')) errors.push(`${owner} must use the shared inline-SVG theme class.`);
}
if (!createGameCss.includes('background: var(--svg-icon-primary)')) {
  errors.push('Create Game SVG stencils must use the root SVG token.');
}
if (/\.maze-app\s+\.cg-ico\.is-tinted/.test(mazeSiteCss)) {
  errors.push('Legacy higher-specificity Create Game SVG tint override remains in maze-site.css.');
}

// These are intentionally outside the in-page CSS theme pipeline: the browser favicon,
// the Reown metadata image, and external provider brand marks keep their brand artwork.
const intentionallyExternal = [
  'index.html favicon (browser chrome resource)',
  'src/platform/wallet/appkit.ts metadata icon (Reown metadata, not in-page UI)',
  'third-party provider logos (official brand assets)',
];

// The original 3D backgrounds are retained under their current wallet-bg filenames.
// Verify the actual public paths used by the shared MazeBackground component.
const mazeBackgroundSource = read('src/features/theme/MazeBackground.tsx');
for (const name of ['wallet-bg-grass.svg', 'wallet-bg-dark.svg', 'wallet-bg-light.svg']) {
  if (!mazeBackgroundSource.includes(`/css/images/${name}`)) {
    errors.push(`MazeBackground does not reference the retained theme asset ${name}.`);
  }
  if (!fs.existsSync(path.join(root, 'public/css/images', name))) {
    errors.push(`MazeBackground theme asset is missing: public/css/images/${name}.`);
  }
}

if (errors.length) {
  console.error('[svg-theme] validation failed:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log('[svg-theme] root-level SVG theme contract verified.');
console.log('[svg-theme] monochrome UI assets, navigation, brand marks, Home surfaces, uniform Create action, MarketSummary, Home hero and Create Game icons are wired to root theme tokens; header theme choices are text-only.');
console.log(`[svg-theme] intentionally external/brand-managed resources: ${intentionallyExternal.join('; ')}.`);
for (const warning of warnings) console.warn(`[svg-theme] warning: ${warning}`);
