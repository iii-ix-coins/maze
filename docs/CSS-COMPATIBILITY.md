# CSS compatibility pipeline

## Architecture

Active CSS is organized by ownership, not by the order of historical overrides:

- `src/styles/theme-tokens.css` is the only owner of global theme palettes and semantic design tokens. It contains no component selectors beyond theme-scoped token contracts.
- `src/styles/style.css` owns the cascade-layer declaration, reset, base typography, global effects, shared primitives and foundational navigation rules. It must not re-declare theme palettes or page-specific appearance.
- `src/styles/site.css` is the global site-shell entry. It imports the shared base, theme tokens, camera/background support, page loader/transitions and shared page-shell rules; it owns the brand host and bottom dock.
- `src/styles/home-shared.css` owns the shared feature-page shell used by Explore and Profile. Page-specific styles stay with `src/features/explore/explore-page.css` and `src/features/profile/profile-page.css`.
- Home presentation is split between `src/styles/home-style.css` and `src/components/home/home-hero-slider.css`, each imported by its owning React component.
- Maze styles are loaded once by `src/features/maze/styles/index.css`. `maze-site.css` remains the compatibility/base layer for the large existing Maze UI; `maze-unify.css` retains the explicitly documented cascade bridge; `maze-theme.css`, `create-game.css` and `lobby.css` own theme, Create Game and Lobby details respectively.

`arena.css`, `feature-pages.css`, `maze-menu.css` and `public/css/maze-style.css` are retired. Theme tokens formerly mixed with broad component overrides have been extracted to `theme-tokens.css`; component rules were moved to their owning stylesheet or removed when no longer used. The old Maze React menu override file has been merged into Create Game and Lobby owners.

Vite inlines the CSS imports before the configured PostCSS plugins run. `@csstools/postcss-cascade-layers` therefore sees the complete stylesheet graph for each entry. `scripts/check-css-duplicates.mjs` walks the global, Home, Explore, Profile and Maze entry points to detect repeated selector/property declarations, repeated keyframes and repeated font-face definitions.

`postcss-preset-env` converts the configured modern color functions and adds vendor prefixes from `.browserslistrc`; `@csstools/postcss-cascade-layers` flattens Cascade Layers for the legacy browser baseline. `scripts/check-css-compat.mjs` validates the emitted production CSS.

## Browser baseline

Production targets Safari 14.1 and iOS Safari 14.5, plus Chrome 90, Firefox 90 and Edge 90. Safari 14.1 is selected rather than Safari 13.x because the active layout relies on Flexbox `gap`, which is supported from Safari 14.1. Dynamic viewport units receive `vh` fallbacks; unsupported visual enhancements remain progressive enhancements.

## Install and build

If project dependencies are not installed, run `npm install` first. Then run:

```bash
npm run check:layout
npm run check:css:duplicates
npm run build:site
```

For full project verification use `npm run check`.

Do not link the old active CSS files from `/css/*.css`; they are sourced from Vite's module graph. Public images and fonts remain in `public/css/images` and `public/css/font`.
