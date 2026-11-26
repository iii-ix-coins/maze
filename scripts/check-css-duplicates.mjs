import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const postcss = require('postcss');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entryPoints = [
  'src/styles/site.css',
  'src/features/home/game-feed.css',
  'src/features/maze/maze-hub.css',
  'src/styles/home-style.css',
  'src/components/home/home-hero-slider.css',
  'src/features/explore/explore-page.css',
  'src/features/profile/profile-page.css',
  'src/components/access/page-access-gate.css',
  'src/features/maze/styles/index.css',
];
const visited = new Set();
const activeFiles = [];

function collectStylesheet(file) {
  const absolute = path.resolve(file);
  if (visited.has(absolute)) return;
  if (!fs.existsSync(absolute)) {
    throw new Error(`Missing active stylesheet: ${path.relative(root, absolute)}`);
  }

  visited.add(absolute);
  activeFiles.push(absolute);
  const source = fs.readFileSync(absolute, 'utf8');
  const ast = postcss.parse(source, { from: absolute });

  ast.walkAtRules('import', (rule) => {
    const importedPath = rule.params.replace(/^['"]|['"]$/g, '').split(/\s+/)[0];
    if (importedPath.startsWith('.')) {
      collectStylesheet(path.resolve(path.dirname(absolute), importedPath));
    }
  });
}

for (const entry of entryPoints) collectStylesheet(path.join(root, entry));

const keyframesByName = new Map();
const fontFacesBySignature = new Map();
for (const file of activeFiles) {
  const ast = postcss.parse(fs.readFileSync(file, 'utf8'), { from: file });
  ast.walkAtRules(/keyframes$/, (rule) => {
    const entries = keyframesByName.get(rule.params) ?? [];
    entries.push(`${path.relative(root, file)}:${rule.source?.start?.line ?? 0}`);
    keyframesByName.set(rule.params, entries);
  });
  ast.walkAtRules('font-face', (rule) => {
    const descriptor = (name) => rule.nodes?.find((node) => node.type === 'decl' && node.prop.toLowerCase() === name)?.value?.trim().toLowerCase() ?? '';
    const signature = [descriptor('font-family'), descriptor('font-weight'), descriptor('font-style'), descriptor('src')].join('|');
    if (!signature.startsWith('|')) {
      const entries = fontFacesBySignature.get(signature) ?? [];
      entries.push(`${path.relative(root, file)}:${rule.source?.start?.line ?? 0}`);
      fontFacesBySignature.set(signature, entries);
    }
  });
}

const repeatedKeyframes = [...keyframesByName.entries()].filter(([, entries]) => entries.length > 1);
const repeatedFontFaces = [...fontFacesBySignature.entries()].filter(([, entries]) => entries.length > 1);
if (repeatedKeyframes.length || repeatedFontFaces.length) {
  console.error('[css-duplicates] repeated animation or font-face definitions found:');
  for (const [name, entries] of repeatedKeyframes) console.error(`  @keyframes ${name}: ${entries.join(', ')}`);
  for (const [signature, entries] of repeatedFontFaces) console.error(`  @font-face ${signature}: ${entries.join(', ')}`);
  process.exit(1);
}

const declarationsByOwner = new Map();
for (const file of activeFiles) {
  const ast = postcss.parse(fs.readFileSync(file, 'utf8'), { from: file });
  ast.walkRules((rule) => {
    const context = [];
    for (let parent = rule.parent; parent && parent.type !== 'root'; parent = parent.parent) {
      if (parent.type === 'atrule') context.unshift(`@${parent.name} ${parent.params}`);
    }

    for (const declaration of (rule.nodes ?? []).filter((node) => node.type === 'decl')) {
      const key = `${context.join(' / ')} | ${rule.selector} | ${declaration.prop}`;
      const entries = declarationsByOwner.get(key) ?? [];
      entries.push({
        file: path.relative(root, file),
        line: declaration.source?.start?.line ?? 0,
        value: declaration.value,
      });
      declarationsByOwner.set(key, entries);
    }
  });
}

const duplicates = [...declarationsByOwner.entries()].filter(([, entries]) => entries.length > 1);
if (duplicates.length) {
  console.error(`[css-duplicates] found ${duplicates.length} repeated selector/property declaration group(s):`);
  for (const [key, entries] of duplicates) {
    console.error(`\n  ${key}`);
    for (const entry of entries) {
      console.error(`    ${entry.file}:${entry.line} => ${entry.value}`);
    }
  }
  process.exit(1);
}

console.log(`[css-duplicates] verified ${activeFiles.length} active CSS files: no repeated selector/property declarations, keyframes or font-face definitions.`);
