# Maze frontend feature

React owns the Maze page, the Create Game Wizard, Rooms browser, Room Details / Waiting Room and Live Races. `MazeMenu.tsx` is the React-owned presentation layer and subscribes to the immutable UI snapshot in `maze-ui-store.ts`.

`CreateGameComponent` is a DOM-free state adapter retained for the existing engine API. `LobbyHub` is a protocol/data coordinator only: it coordinates the existing WebSocket client and `LobbyStore`, then publishes snapshots and user actions to React. The lobby data store, sorting/filtering algorithms, room protocol and persisted preference keys remain independent of the view components.

The simulation remains an independent TypeScript engine. Maze generation, game state, Canvas rendering, frame loop, keyboard/pointer/joystick input, save format and multiplayer message protocol are not moved into React state. `MazeStage` and `LiveThumb` are canvas preview renderers with explicit React mount/unmount cleanup.

The Create/Rooms/Live menu, in-race HUD, Race Board, result cards and site-facing Maze controls are React-owned. The original static game DOM IDs remain as the engine compatibility boundary. The remaining imperative modules are limited to the independent simulation/render/input lifecycle and canvas-based visual effects; they are not UI controllers. Do not move high-frequency game-loop updates into React state.


## Maze Hub vs. Maze runtime

`/maze` is the lightweight Maze Hub route. It owns the former Home market summary and hero slider. `/maze.html` and `/play` are aliases for the Maze runtime route inside the same SPA document; they no longer create a document-navigation boundary. The bottom-dock Maze action opens the Hub; Create opens `/maze.html?view=create` through the shared router and transition coordinator.


## Game Feed integration boundary

The site Home route reads the existing read-only `GET /rooms` snapshot through `src/features/home/game-feed-api.ts`. It does not create another WebSocket client or Game Engine. This currently supports live-room cards, joinable waiting-room cards and short-lived recent result summaries. It does not provide a durable replay, recording, social interactions or a persistent post feed; those require separate server-side features.

## Stable game-content frame initialization

The shared SPA document sets `body.in-menu` synchronously for the Maze route paths (`/maze.html` and `/play`) before React mounts. `MazeMenu` must not toggle that class until the engine has completed its first `restoreGame()` / `showMenu()` decision. `engine/boot.ts` publishes `maze:engine-ready` after that decision; the React menu then synchronizes the body mode. `MazeFrame` owns route activation and removes all Maze body-mode classes whenever another route becomes active, including the guest-gate path where `MazeMenu` is not mounted yet. `MazeMenu` also keeps its unmount-only cleanup as a local safeguard; never put that cleanup in the `state.visible` effect.

## Persistent content frame

`MazeFrame.tsx` is eager and owns `#mazeApp` (frame, scrollbar, theme and body-mode classes) in the single React root. `MazePage.tsx` is loaded on the first Maze visit and keeps the exact game DOM mounted for the lifetime of that root; `engine-entry.ts` mounts and disposes the runtime as the authenticated Maze route becomes active or inactive. This persistence is required because `engine/dom.ts` caches DOM nodes. The initial Create / Rooms / Live tab is read from `?view=` by `maze-ui-store.ts` before the first render. The content stays hidden (`visibility`, no animation) until `data-maze-engine-ready` is set.

## Menu tab motion ownership

The Create / Rooms / Live panel transition is coordinated by the React `MazeMenu` presentation layer. `CreateGameComponent` remains a DOM-free state adapter and publishes the selected view through its transition callback; `MazeMenu` applies a named View Transition when supported, or a short CSS exit/enter fallback otherwise. Only the active `.cg-view` receives the transition name. The `#mazeApp` frame, tabs rail, scrollbar, `CreateWizard` mount, preview Canvas, LobbyHub, room store and WebSocket lifecycle remain outside the animated surface.


## Shared motion system

All registered site routes, including Maze, use the same same-document transition coordinator. Native View Transitions animate the active content surface when the destination lazy chunk is already resolved; first visits to an unloaded route use a brief CSS exit/entry fallback so Suspense does not produce an empty transition snapshot. Persistent site chrome stays mounted. Maze's persistent frame is kept in the DOM but hidden while another route is active; its engine resources are disposed during that route transition.

Create / Rooms / Live panel transitions are owned by the React `MazeMenu` presentation layer. `CreateGameComponent` remains a DOM-free state adapter and the panel switch does not unmount the persistent wizard preview or canvas. Reduced-motion preferences disable these transitions.
