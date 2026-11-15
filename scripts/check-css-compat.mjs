import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = path.join(root, 'dist', 'site', 'assets');
if (!fs.existsSync(assetsDir)) {
  console.error('[css-compat] missing dist/site/assets; run the Vite build first.');
  process.exit(1);
}

function collectCss(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectCss(full);
    return entry.isFile() && entry.name.endsWith('.css') ? [full] : [];
  });
}

const files = collectCss(assetsDir);
if (!files.length) {
  console.error('[css-compat] no emitted CSS assets found.');
  process.exit(1);
}

const errors = [];
// Enforce a source-level ban as well as checking the emitted production CSS.
// Split the function name so this guard itself is not mistaken for a CSS usage.
const forbiddenColorBlend = new RegExp(String.raw`\bcolor-${'mix'}\s*\(`, 'i');

function collectSourceCss(dir) {
  if (!fs.existsSync(dir)) return [];
  const ignoredDirs = new Set(['node_modules', 'dist', 'coverage', '.git']);
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return ignoredDirs.has(entry.name) ? [] : collectSourceCss(full);
    }
    return entry.isFile() && entry.name.endsWith('.css') ? [full] : [];
  });
}

// Scan all repository CSS, including legacy and currently unreferenced files.
const sourceCssFiles = collectSourceCss(root);

for (const file of sourceCssFiles) {
  const source = fs.readFileSync(file, 'utf8');
  if (forbiddenColorBlend.test(source)) {
    errors.push(`${path.relative(root, file)}: unsupported dynamic color blending remains in source CSS`);
  }
}

for (const file of files) {
  const css = fs.readFileSync(file, 'utf8');
  const relative = path.relative(root, file);
  const ast = postcss.parse(css, { from: relative });

  if (forbiddenColorBlend.test(css)) {
    errors.push(`${relative}: unsupported dynamic color blending remains in production CSS`);
  }

  ast.walkAtRules('layer', (rule) => {
    errors.push(`${relative}: untransformed @layer remains in production CSS`);
  });

  ast.walkDecls((decl) => {
    if (/\b(?:oklch|oklab)\(/i.test(decl.value)) {
      errors.push(`${relative}: untransformed OKLCH/OKLab remains in ${decl.prop}`);
    }
    if (decl.prop.toLowerCase() === 'backdrop-filter') {
      const hasWebkitPrefix = (decl.parent?.nodes ?? []).some((sibling) =>
        sibling.type === 'decl' && sibling.prop.toLowerCase() === '-webkit-backdrop-filter',
      );
      if (!hasWebkitPrefix) {
        errors.push(`${relative}: backdrop-filter is missing its Safari-prefixed declaration`);
      }
    }
  });
}

if (errors.length) {
  console.error('[css-compat] compatibility verification failed:\n' + errors.map((e) => ` - ${e}`).join('\n'));
  process.exit(1);
}

console.log(
  `[css-compat] verified ${files.length} production CSS asset(s): ` +
  `source and production CSS contain no unsupported dynamic color blending; ` +
  `layers and modern OKLCH syntax are transformed; ` +
  `Safari backdrop-filter prefixes are present.`
);
