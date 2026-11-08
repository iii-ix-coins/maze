import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { STEP_ICONS, iconUrl } from '../../../src/features/maze/ui/create-game/icons';

const root = new URL('../../../', import.meta.url);
const imageRoot = new URL('public/maze-assets/assets/images/', root);
const reactMenu = fs.readFileSync(new URL('src/features/maze/ui/react/MazeMenu.tsx', root), 'utf8');
const siteChrome = fs.readFileSync(new URL('src/components/layout/SiteChromeHosts.tsx', root), 'utf8');
const homePage = fs.readFileSync(new URL('src/features/home/HomePage.tsx', root), 'utf8');
const mazeLayoutCss = fs.readFileSync(new URL('src/features/maze/styles/maze-unify.css', root), 'utf8');
const onlineClient = fs.readFileSync(new URL('src/features/maze/engine/online.ts', root), 'utf8');
const createGameController = fs.readFileSync(new URL('src/features/maze/ui/create-game/create-game.ts', root), 'utf8');

test('every icon declared in icons.js points at a real SVG file', () => {
    for (const [name, icon] of Object.entries(STEP_ICONS)) {
        const file = fileURLToPath(new URL(icon.file, imageRoot));

        assert.equal(
            new URL(iconUrl(name, 'https://example.test/')).pathname,
            `/maze-assets/assets/images/${icon.file}`
        );

        assert.ok(file.startsWith(fileURLToPath(root)), `${name} resolves inside the project`);
        assert.ok(fs.existsSync(file), `${name}: missing file ${icon.file}`);
        assert.match(fs.readFileSync(file, 'utf8'), /<svg[\s>]/, `${name}: ${icon.file} is not an SVG`);
        assert.ok(icon.fit > 0, `${name}: fit must be positive`);
        assert.equal(typeof icon.tint, 'boolean', `${name}: tint must be true or false`);
    }
});

test('every data-icon used in index.html is declared in icons.js', () => {
    const html = fs.readFileSync(new URL('src/features/maze/maze-markup.html', root), 'utf8');
    const used = [...html.matchAll(/data-icon="([^"]+)"/g)].map(match => match[1]);
    assert.ok(used.length >= 4, 'the four wizard steps carry an icon');
    for (const name of used) assert.ok(name in STEP_ICONS, `index.html asks for unknown icon "${name}"`);
});

test('the wizard markup and the stylesheet name no image files; icons.js is the only place', () => {
    const html = fs.readFileSync(new URL('src/features/maze/maze-markup.html', root), 'utf8');
    const css = fs.readFileSync(new URL('src/features/maze/styles/create-game.css', root), 'utf8');
    for (const [name, icon] of Object.entries(STEP_ICONS)) {
        assert.ok(!html.includes(icon.file), `index.html must not hard-code ${icon.file} (${name})`);
        assert.ok(!css.includes(icon.file), `create-game.css must not hard-code ${icon.file} (${name})`);
    }
});

test('iconUrl rejects names that are not declared', () => {
    assert.throws(() => iconUrl('nope'), /Unknown icon/);
});


test('the active React wizard renders the four registry-backed step icons', () => {
    for (const name of ['size', 'racers', 'targets', 'launch']) {
        assert.ok(reactMenu.includes(`icon: '${name}'`), `React wizard is missing the ${name} step`);
    }
    assert.match(reactMenu, /className="cg-rail is-ready"/);
    assert.match(reactMenu, /STEP_ICONS\[iconName\]/);
    assert.match(reactMenu, /iconUrl\(iconName\)/);
    assert.match(reactMenu, /iconUrl\('check'\)/);
});

test('the active React wizard drives every panel from the selected step state', () => {
    for (const step of [0, 1, 2, 3]) {
        assert.ok(reactMenu.includes(`className={stepClass(${step})}`), `step ${step} does not use the reactive panel class`);
    }
    assert.match(reactMenu, /state\.step === step \? ' is-active'/);
});


test('Maze route omits the generic Home brand headline and interaction dock', () => {
    assert.match(homePage, /<SiteChromeHosts mazePage=\{isMazeRoute\} \/>/);
    assert.match(siteChrome, /\{!mazePage && \(/);
    assert.match(siteChrome, /<SiteNavigation \/>/);
});

test('Maze page overrides the fixed wizard shell in the unlayered layout stylesheet', () => {
    assert.match(mazeLayoutCss, /#mazeApp\.maze-app\.in-menu > #createGame\.cg\s*\{[\s\S]*?position:\s*relative/);
    assert.match(mazeLayoutCss, /#mazeApp\.maze-app\.in-menu > #createGame\.cg #cgViewCreate > \.cg-layout/);
});

test('Launch is single-flight and restores the wizard when game startup fails', () => {
    assert.match(reactMenu, /const startLaunch = useCallback/);
    assert.match(reactMenu, /launchPending\.current \|\| current\.launching/);
    assert.match(reactMenu, /await createGame\.launch\(\)/);
    assert.match(createGameController, /catch \(error\)[\s\S]*?Game launch failed/);
    assert.match(createGameController, /The game could not start\. Please try again\./);
});

test('production multiplayer never guesses the frontend host as the Maze server', () => {
    assert.ok(
        onlineClient.includes(
            "if (!localHosts.has(window.location.hostname.toLowerCase())) return '';"
        ),
        'production must not guess the frontend host as the Maze server'
    );
    assert.match(onlineClient, /url\.protocol === 'https:'\) url\.protocol = 'wss:'/);
    assert.match(onlineClient, /window\.location\.protocol === 'https:' && url\.protocol !== 'wss:'/);
});
