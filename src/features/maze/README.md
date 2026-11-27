# Maze frontend feature

React owns the Maze page, the Create Game Wizard, Rooms browser, Room Details / Waiting Room and Live Races. `MazeMenu.tsx` is the React-owned presentation layer and subscribes to the immutable UI snapshot in `maze-ui-store.ts`.

`CreateGameComponent` is a DOM-free state adapter retained for the existing engine API. `LobbyHub` is a protocol/data coordinator only: it coordinates the existing WebSocket client and `LobbyStore`, then publishes snapshots and user actions to React. The lobby data store, sorting/filtering algorithms, room protocol and persisted preference keys remain independent of the view components.

The simulation remains an independent TypeScript engine. Maze generation, game state, Canvas rendering, frame loop, keyboard/pointer/joystick input, save format and multiplayer message protocol are not moved into React state. `MazeStage` and `LiveThumb` are canvas preview renderers with explicit React mount/unmount cleanup.

The Create/Rooms/Live menu, in-race HUD, Race Board, result cards and site-facing Maze controls are React-owned. The original static game DOM IDs remain as the engine compatibility boundary. The remaining imperative modules are limited to the independent simulation/render/input lifecycle and canvas-based visual effects; they are not UI controllers. Do not move high-frequency game-loop updates into React state.


## Maze Hub vs. Maze runtime

`/maze` is the lightweight Maze Hub route. It owns the former Home market summary and hero slider. `/maze.html` (and `/play`) remain the non-soft-navigation Maze runtime document that mounts the existing game engine into `#maze-root`. The bottom-dock Maze action opens the Hub; Create still opens `/maze.html?view=create`.


## Game Feed integration boundary

The site Home route reads the existing read-only `GET /rooms` snapshot through `src/features/home/game-feed-api.ts`. It does not create another WebSocket client or Game Engine. This currently supports live-room cards, joinable waiting-room cards and short-lived recent result summaries. It does not provide a durable replay, recording, social interactions or a persistent post feed; those require separate server-side features.

## Stable game-content frame initialization

The `/maze.html` document sets `body.in-menu` synchronously from the route before React mounts. `MazeMenu` must not toggle that class until the engine has completed its first `restoreGame()` / `showMenu()` decision. `engine/boot.ts` publishes `maze:engine-ready` after that decision; the React menu then synchronizes the body mode. `MazeFrame` owns the route lifetime and clears all Maze body-mode classes on unmount, including the guest-gate path where `MazeMenu` is never mounted. `MazeMenu` also keeps its unmount-only cleanup as a local safeguard; never put that cleanup in the `state.visible` effect.

## Persistent content frame

`MazeFrame.tsx` is eager and owns `#mazeApp` (frame, scrollbar, theme and body-mode classes). It mounts in the first React commit together with the header and dock. `MazePage.tsx` is lazy and renders only the content inside that frame and boots the engine. The initial Create / Rooms / Live tab is read from `?view=` by `maze-ui-store.ts` before the first render. The content stays hidden (`visibility`, no animation) until `data-maze-engine-ready` is set.

## Menu tab motion ownership

The Create / Rooms / Live panel transition is coordinated by the React `MazeMenu` presentation layer. `CreateGameComponent` remains a DOM-free state adapter and publishes the selected view through its transition callback; `MazeMenu` applies a named View Transition when supported, or a short CSS exit/enter fallback otherwise. Only the active `.cg-view` receives the transition name. The `#mazeApp` frame, tabs rail, scrollbar, `CreateWizard` mount, preview Canvas, LobbyHub, room store and WebSocket lifecycle remain outside the animated surface.


## Shared motion system

Site route transitions are scoped to the inner `.feature-page-shell`; the persistent route frame, custom scrollbar, header and navigation dock remain mounted and do not animate. Native View Transitions are used only when the target lazy page chunk has already resolved. First visits to an unloaded route use a brief CSS exit/entry fallback so Suspense does not produce an empty transition snapshot.

Create / Rooms / Live panel transitions are owned by the React `MazeMenu` presentation layer. `CreateGameComponent` remains a DOM-free state adapter and the panel switch does not unmount the persistent wizard preview or canvas. Reduced-motion preferences disable these transitions.
