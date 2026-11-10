# Styles

All active site styles are authored in this folder and `src/features/maze/styles`. Every active HTML page loads the single Vite entry `site.css`.

Keep the `@import` order in `site.css` deliberate. Vite inlines the complete graph before PostCSS runs, allowing the cascade-layer converter to process the entire site stylesheet once.
