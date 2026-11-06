# Hollld — one root Vite + React application

The repository root is now the only Vite project. Both `/` and `/maze.html` are routed through the same React application and are built by the same Vite production build.

## Commands

```bash
# First install from the repository root (the old lockfile was intentionally removed)
npm install

# Build the React/Vite frontend and the separate Maze WebSocket server bundle
npm run build:all

# Start the existing Express + platform engines
npm start

# Start the Maze multiplayer WebSocket server in a separate terminal
npm run start:maze-server

# During frontend development (keep npm start running in another terminal)
npm run dev:site
```

Development URL: `http://localhost:5173/` and `http://localhost:5173/maze.html`.
Production URL: `http://localhost:5000/` and `http://localhost:5000/maze.html`.

## Architecture

- `index.html`, `vite.config.ts`, `package.json`: repository-root frontend toolchain; `scripts/build-maze-server.mjs` only bundles the Node WebSocket server.
- `src/app` and `src/components`: React application shell and common UI hosts.
- `src/features/home`: React shell plus the compatibility runtime. The source copies of the old browser controllers are kept under `src/features/home/legacy-scripts` and are now part of the root Vite source graph; ES modules are imported by Vite, while classic scripts are emitted as Vite assets to preserve their classic global scope and exact execution order.
- `src/features/maze`: Maze page rendered by React; the original TypeScript Canvas/input/lobby code is now part of the root Vite source graph. React owns the page markup and lifecycle boundary; the existing game engine continues to own Canvas frames, game state, input and the multiplayer protocol.
- `shared/maze`: shared game-generation rules and WebSocket protocol types; kept unchanged.
- `engines/maze-server`: the existing Maze multiplayer server source.
- `engines/*`, `shared/state`, `server.js`, `start.js`: existing platform backend and workers.
- `public/css`, `public/images`, `public/fonts`, `public/maze-assets`: stable static asset URLs. `public/js` is retained only for the synchronous pre-React Theme initializer and explicit legacy rollback pages; the active Home script sources live under `src/features/home/legacy-scripts`.
- `legacy`: original standalone HTML documents, retained for rollback and visual comparison.
- `tests/maze`: original Maze tests and the existing parity harness. The parity harness still requires the missing `legacy/mazeV3` reference source to prove full historical parity.

## No-regression migration rule

The original CSS files, asset paths, LocalStorage keys, API contracts, WebSocket protocol and game-generation algorithms are preserved. The old page markup is reused as a React-rendered template so the DOM IDs/classes expected by the existing game and feature controllers do not change. The Home feature controllers are still compatibility code, not yet rewritten as native React stateful components. Their ES-module sources are imported through the root Vite graph; classic scripts are emitted as separate Vite assets and mounted by the React-owned page shell. Replace them feature-by-feature only after matching functional, visual and network tests pass. The Maze Canvas/game engine remains imperative TypeScript by design; React owns its page boundary and Vite bundles its source.

## Development and API requirements

- `npm start` starts Express and the existing platform engines on port 5000.
- `npm run dev:site` starts only Vite on port 5173 and proxies `/api` and `/health` to port 5000.
- Multiplayer requires `npm run start:maze-server` (port 8081), unless that server is started separately by the deployment process manager.
- Node.js `>=22.12.0` is required by the root toolchain; Node 24 LTS is a suitable option.


## نصب وابستگی‌ها و Lockfile

در بستهٔ تحویلی `package-lock.json` عمداً حذف شده است، چون Lockfile ZIP ورودی فقط وابستگی‌های Backend قدیمی را ثبت می‌کرد و React/Vite را نداشت. یک بار `npm install` اجرا کنید تا Lockfile تازه و کامل ساخته شود؛ پس از آن برای نصب‌های تکراری از `npm ci` استفاده کنید.
