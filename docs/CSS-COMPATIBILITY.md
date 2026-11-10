# CSS compatibility pipeline

## Architecture

Active site CSS is authored in `src/styles` and `src/features/maze/styles`. Every active HTML page loads the same single Vite CSS entry: `src/styles/site.css`. It imports the complete ordered graph for the global shell, home and feature pages, and React Maze UI. Vite inlines CSS `@import` statements before the configured PostCSS plugins run. This single-entry design is deliberate: `@csstools/postcss-cascade-layers` must process the complete stylesheet once rather than isolated or parallel component stylesheets.

`postcss-preset-env` converts the configured modern color functions and adds vendor prefixes from `.browserslistrc`; `@csstools/postcss-cascade-layers` flattens Cascade Layers for the legacy browser baseline. `scripts/check-css-compat.mjs` validates the emitted production CSS.

## Browser baseline

Production targets Safari 14.1 and iOS Safari 14.5, plus Chrome 90, Firefox 90 and Edge 90. Safari 14.1 is selected rather than Safari 13.x because the active layout relies on Flexbox `gap`, which is supported from Safari 14.1. Dynamic viewport units receive `vh` fallbacks; unsupported visual enhancements remain progressive enhancements.

## Install and build

After receiving this migration, run `npm install` once. This resolves the two new PostCSS development dependencies and updates `package-lock.json` to match `package.json`. Then run:

```bash
npm run check:layout
npm run build:site
```

For the full project verification use `npm run check`.

Do not link the old active CSS files from `/css/*.css`; they were moved into Vite's source graph. Public images and fonts remain in `public/css/images` and `public/css/font`. `public/css/maze-style.css` is a legacy, currently unreferenced stylesheet and is intentionally not part of the active CSS graph.
