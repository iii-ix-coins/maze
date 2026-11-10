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
for (const file of files) {
  const css = fs.readFileSync(file, 'utf8');
  const relative = path.relative(root, file);
  const ast = postcss.parse(css, { from: relative });

  ast.walkAtRules('layer', (rule) => {
    errors.push(`${relative}: untransformed @layer remains in production CSS`);
  });

  ast.walkDecls((decl) => {
    if (/\b(?:oklch|oklab)\(/i.test(decl.value)) {
      errors.push(`${relative}: untransformed OKLCH/OKLab remains in ${decl.prop}`);
    }

    if (/\bcolor-mix\(/i.test(decl.value)) {
      const siblings = decl.parent?.nodes ?? [];
      const index = siblings.indexOf(decl);
      const hasFallback = siblings.slice(0, index).some((previous) =>
        previous.type === 'decl' && previous.prop === decl.prop && !/\bcolor-mix\(/i.test(previous.value),
      );
      if (!hasFallback) {
        errors.push(`${relative}: ${decl.prop} uses color-mix() without a preceding legacy fallback`);
      }
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

console.log(`[css-compat] verified ${files.length} production CSS asset(s): layers and modern OKLCH syntax are transformed; dynamic color-mix fallbacks and Safari backdrop-filter prefixes are present.`);
