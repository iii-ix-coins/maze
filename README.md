# Hollld — single-root Vite + React frontend

The repository has one Vite frontend and one React application root. The Home shell and the static Maze interface are rendered by React; the existing Maze simulation and all Node.js services remain separate modules behind their existing interfaces.

## Commands

```bash
npm install
npm run build:all
npm start
```

For frontend development (keep the Express server running in another terminal):

```bash
npm run dev:site
```

For the Maze multiplayer server when it is not started by the deployment process manager:

```bash
npm run start:maze-server
```

Development URLs: `http://localhost:5173/` and `http://localhost:5173/maze.html`.
Production URLs: `http://localhost:5000/` and `http://localhost:5000/maze.html`.

## Current architecture

- `index.html`, `coin.html`, `holders.html`, `market.html`, `vite.config.mts`, `package.json`: the Vite page inputs and frontend toolchain.
- `src/main.tsx`, `src/app`: one React root, route dispatch, providers and error boundary.
- `src/features/home/HomePage.tsx`: React-owned Home shell, Market Summary, Live Feed and Holders sections.
- `src/components/navigation`: React Navigation, theme selector and Maze view selector.
- `src/features/interaction/InteractionBar.tsx`: React Views / Likes / Shares / Share Modal UI; existing `/api/stats*` contracts are retained.
- `src/features/market`, `src/features/coin`, `src/features/holders`, `src/features/live-feed`: React market snapshot, Token detail (`/coin.html`), Holders (`/holders.html`) and live activity views. Existing market, history and live-feed endpoints/polling semantics are retained.
- `src/features/maze/MazePage.tsx` and `MazeMarkup.tsx`: React owns the Maze page structure and static DOM tree. The full set of original IDs, classes, canvases and control hooks is retained.
- `src/features/maze/engine`, `canvas`, `input`, `net`, `shared/maze`: the independent TypeScript simulation, renderer, input system, and multiplayer client/protocol. These modules are Vite-managed but not React state, intentionally avoiding high-frequency game-loop renders. The animated site background's SVG structure is React-owned by `src/features/theme/MazeBackground.tsx`; only its camera transform is updated imperatively per frame.
- `engines/*`, `shared/state`, `server.js`, `start.js`: existing Node.js backend, workers, state and SQLite integration. Their source and contracts are outside this frontend migration.
- `legacy/home.html` and `legacy/maze.html`: static, script-free fallback notices retained only because the unchanged Express server references them when no production React build exists. The duplicated DOM controllers, `public/js/`, archived Home scripts, and old compiled Maze UI bundle have been removed.
- Public asset directories: `public/css/images` and `public/css/font` hold the asset URLs used by the React code and `public/css/style.css` (the former mirror directories `public/images` and `public/fonts` were removed, and `scripts/check-layout.mjs` now requires the `public/css/*` ones). The Create Wizard icons are served from `public/maze-assets/assets/images/`.
- Shared page head: the four HTML entries do not repeat the common stylesheets. Each contains one marker comment (`@shared-styles`) and the `maze-shared-styles` plugin in `vite.config.mts` replaces it with the `SHARED_STYLES` links (`style.css`, `header-scroll-scrim.css`, `maze-camera.css`, in that order). `maze-camera.css` also provides the animated background, so a new page must include the marker to get it. `scripts/check-layout.mjs` enforces the marker.

## Migration status — Phase 4

The Home shell, market snapshot, live-feed rail, holders table and Token detail page are now React-owned. The Coin/Token, Market and Holders pages have dedicated Vite HTML inputs and share the same React application entry. The Maze lobby and in-race UI have also been migrated to React while the engine remains independent.

The legacy browser controllers, their duplicate source copies, the old compiled Maze UI bundle, and the imperative Maze background bootstrap have been deleted. Active pages load only the shared React entry. Minimal synchronous inline pre-paint snippets remain solely to restore the saved theme before CSS paints and, on the shared `/maze.html` entry, to apply the existing `body.in-menu` styling hook before React mounts; they do not create UI or run application controllers. The two Express fallback documents are static notices with no scripts. A fully automated visual parity pass and production build still need to be run in an environment with project dependencies installed.

## No-regression constraints

The current migration keeps the following stable:

- Existing CSS files, public asset URLs, IDs, classes and layout hooks.
- Existing theme names and LocalStorage keys (`maze-theme`, `hollld-theme`).
- Existing API paths, HTTP methods, request payload expectations and response shapes.
- Existing Maze game generation, save format, Canvas renderer, simulation loop, input semantics and WebSocket protocol.
- Existing Express application, platform engines, database schema and backend process entry points.

The React UI must not reimplement or drive the high-frequency simulation loop. Use React for UI state and lifecycle; use a narrow adapter/store boundary for the TypeScript engine. Backend code should only change when a separate, explicit backend task requires it.

## Validation

Run the following after installing dependencies:

```bash
npm run check:layout
npm run typecheck
npm run build:all
npm run test:all
```

Visual and functional parity must also be tested in a browser at desktop, tablet and mobile sizes. The historical Maze parity harness still requires the original `legacy/mazeV3` baseline, which was not included in the source archive.
