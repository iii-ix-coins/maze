import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { STEP_ICONS, iconUrl } from '../../../src/features/maze/ui/create-game/icons';

const root = new URL('../../../', import.meta.url);
const imageRoot = new URL('public/maze-assets/assets/images/', root);

test('every icon declared in icons.js points at a real SVG file', () => {
    for (const [name, icon] of Object.entries(STEP_ICONS)) {
        const file = fileURLToPath(new URL(icon.file, imageRoot));
        assert.equal(new URL(iconUrl(name)).pathname, `/maze-assets/assets/images/${icon.file}`);
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
