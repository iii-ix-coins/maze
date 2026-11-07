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

- `index.html`, `vite.config.ts`, `package.json`: the only frontend document and Vite toolchain.
- `src/main.tsx`, `src/app`: one React root, route dispatch, providers and error boundary.
- `src/features/home/HomePage.tsx`: React-owned Home shell and page lifecycle.
- `src/components/navigation`: React Navigation, theme selector and Maze view selector.
- `src/features/interaction/InteractionBar.tsx`: React Views / Likes / Shares / Share Modal UI; existing `/api/stats*` contracts are retained.
- `src/features/maze/MazePage.tsx` and `MazeMarkup.tsx`: React owns the Maze page structure and static DOM tree. The full set of original IDs, classes, canvases and control hooks is retained.
- `src/features/maze/engine`, `canvas`, `input`, `net`, `shared/maze`: the independent TypeScript simulation, renderer, input system, and multiplayer client/protocol. These modules are Vite-managed but not React state, intentionally avoiding high-frequency game-loop renders.
- `engines/*`, `shared/state`, `server.js`, `start.js`: existing Node.js backend, workers, state and SQLite integration. Their source and contracts are outside this frontend migration.
- `legacy/` and `src/features/home/legacy-scripts/`: retained reference/baseline sources. They are not imported by the active Home or Maze routes.

## Migration status — Phase 1

The active Home shell has been migrated from imperative DOM construction to React components: Navigation and its menus, Theme and Game view switchers, Brand header, interaction dock, share modal and their local state are now React-owned. The static Maze interface has also been converted from an HTML string injected with `dangerouslySetInnerHTML` into JSX rendered by React.

This is a meaningful first migration slice, not a claim that the requested 100% React UI target is complete. The dynamic Maze UI is still driven by existing imperative TypeScript modules under `src/features/maze/ui/`, `lobby/`, `rooms/`, `create-game/`, `live/`, `race/` and `input/`. These are the next conversion targets. Coin/token, holders, market and live-feed feature controllers are also not yet active React routes in this build.

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
