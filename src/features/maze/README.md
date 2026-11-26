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

The `/maze.html` document sets `body.in-menu` synchronously from the route before React mounts. `MazeMenu` must not toggle that class until the engine has completed its first `restoreGame()` / `showMenu()` decision. `engine/boot.ts` publishes `maze:engine-ready` after that decision; the React menu then synchronizes the body mode. Keep the body-class cleanup in an unmount-only effect, never in the `state.visible` effect, because effect cleanup runs on every visibility change and would briefly remove the shared frame geometry.
