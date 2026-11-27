# Hollld — single-root Vite + React frontend

The repository has one Vite frontend, one React application root, one persistent site frame and one route content surface. Every site and Maze destination is rendered through the same React route tree and `.route-view` contract; the existing Maze simulation and all Node.js services remain separate modules behind their existing interfaces.

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

- `index.html`, `vite.config.mts`, `package.json`: the single Vite SPA document and frontend toolchain.
- `src/main.tsx`, `src/app`: one React root, route dispatch, providers and error boundary. `AppRouter` keeps one `.route-page` and one `main.feature-page-shell` mounted while only the direct `.route-view` destination changes.
- `src/features/home/HomePage.tsx`: React-owned Home shell with the compact Market Summary.
- `src/components/navigation`: React bottom navigation with Home, Explore, Maze, Create, Notifications and Profile; the shared Theme Switcher is centered in the header. The former Holders and More destinations have been retired.
- `src/features/explore`, `src/features/market`: Explore links to Maze Live and Rooms; the compact Home market snapshot remains available. The dedicated Holders page, API and background engine have been retired.
- `src/features/maze/MazeFrame.tsx`, `MazePage.tsx` and `MazeMarkup.tsx`: the persistent `#mazeApp.route-view` is a direct child of the same shared `feature-page-shell` used by all other pages. React owns its structure and static DOM tree; the original IDs, classes, canvases and control hooks remain available to the Engine.
- `src/features/maze/engine`, `canvas`, `input`, `net`, `shared/maze`: the independent TypeScript simulation, renderer, input system, and multiplayer client/protocol. These modules are Vite-managed but not React state, intentionally avoiding high-frequency game-loop renders. The animated site background's SVG structure is React-owned by `src/features/theme/MazeBackground.tsx`; only its camera transform is updated imperatively per frame.
- `engines/*`, `shared/state`, `server.js`, `start.js`: Node.js backend, workers, state and SQLite integration. The unused Interaction Engine and its dedicated stats API were retired with the interaction dock; other services and API contracts remain active.
- `legacy/home.html` and `legacy/maze.html`: static, script-free fallback notices retained only because the unchanged Express server references them when no production React build exists. The duplicated DOM controllers, `public/js/`, archived Home scripts, and old compiled Maze UI bundle have been removed.
- Public assets: `public/css/images` contains site and game imagery; `public/fonts/nunito` is the single self-hosted Nunito webfont source (weights 200, 300, 400, 600, 700, 800, 900 in WOFF2/WOFF). The previous Montserrat font assets were retired. The Create Wizard icons are served from `public/maze-assets/assets/images/`.
- Shared page head: the four HTML entries do not repeat the common stylesheets. Each contains one marker comment (`@shared-styles`) and the `maze-shared-styles` plugin in `vite.config.mts` replaces it with the `SHARED_STYLES` links (`style.css`, `header-scroll-scrim.css`, `maze-camera.css`, in that order). `maze-camera.css` also provides the animated background, so a new page must include the marker to get it. `scripts/check-layout.mjs` enforces the marker.

## One-root route geometry

The runtime layout contract is intentionally singular:

1. `#root` is the only application mount.
2. The persistent `.route-page` is the only outer frame.
3. Its direct `main.feature-page-shell` is the only content viewport and vertical scroll owner.
4. Every route contributes exactly one direct `.route-view`. Maze's persistent `#mazeApp` is one of these route views, not a portal or a sibling root.
5. The custom scrollbar and View Transition coordinator target that same content surface / active route view for every feature.

Maze-specific state classes stay on `#mazeApp`. The Engine sizes the board against this route view's actual content rectangle. Gameplay can lock the existing content scroller, but it must not add a second scroller or viewport. See `UNIFIED-ROUTE-ARCHITECTURE-FA.md` and `src/features/maze/README.md` before adding a new route or changing the shell.

## Migration status — Phase 4

The Home shell and compact market snapshot, Explore and Profile are React-owned. Explore is the only site-level entry for Maze Live and Rooms; the former top-right Create/Rooms/Live switcher and standalone Token/Coin and Market pages have been retired. The Maze lobby and in-race UI remain React-owned while the game engine stays independent.

The legacy browser controllers, their duplicate source copies, the old compiled Maze UI bundle, and the imperative Maze background bootstrap have been deleted. Active pages load only the shared React entry. The sole synchronous inline pre-paint snippet restores the saved theme before CSS paints; Maze route state is initialized by React on the local `#mazeApp` root, not on `body`. The two Express fallback documents are static notices with no scripts. Build and browser visual parity still need to be run in an environment with the exact project toolchain installed.

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
