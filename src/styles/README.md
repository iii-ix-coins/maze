# Styles

All active site styles are authored in this folder and `src/features/maze/styles`. Every active HTML page loads the single Vite entry `site.css`.

Keep the `@import` order in `site.css` deliberate. Vite inlines the complete graph before PostCSS runs, allowing the cascade-layer converter to process the entire site stylesheet once.


## Theme-aware SVG contract

All first-party monochrome SVG interface assets must use the shared `ThemedSvgIcon` component or an inline SVG with `theme-svg-inline`. The component uses the SVG alpha channel as geometry and takes its pigment from the semantic tokens in `theme-tokens.css`; do not add per-theme selector overrides to individual icon files.

The root token contract is:

- `--svg-icon-primary`: default interface icon and wordmark colour
- `--svg-icon-secondary`: quieter interface icon colour
- `--svg-icon-accent`: emphasis colour
- `--svg-icon-on-accent`: contrast colour for icons placed on accent surfaces

Theme values are defined once in `theme-tokens.css` for Light, Dark and Grass. Inline SVGs should use `stroke="currentColor"` and/or `fill="currentColor"` and opt into `theme-svg-inline`. Create Game stencil icons use the same `--svg-icon-*` tokens.

Do not automatically mask user photos, third-party provider logos, or complex brand artwork whose original multi-colour identity must remain intact. Decorative first-party monochrome illustrations (for example, Home hero banners) may use `ThemedSvgIcon`.
