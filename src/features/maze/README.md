# Maze frontend feature

React owns the Maze page, the Create Game Wizard, Rooms browser, Room Details / Waiting Room and Live Races. `MazeMenu.tsx` is the React-owned presentation layer and subscribes to the immutable UI snapshot in `maze-ui-store.ts`.

`CreateGameComponent` is a DOM-free state adapter retained for the existing engine API. `LobbyHub` is a protocol/data coordinator only: it coordinates the existing WebSocket client and `LobbyStore`, then publishes snapshots and user actions to React. The lobby data store, sorting/filtering algorithms, room protocol and persisted preference keys remain independent of the view components.

The simulation remains an independent TypeScript engine. Maze generation, game state, Canvas rendering, frame loop, keyboard/pointer/joystick input, save format and multiplayer message protocol are not moved into React state. `MazeStage` and `LiveThumb` are canvas preview renderers with explicit React mount/unmount cleanup.

The Create/Rooms/Live menu, in-race HUD, Race Board, result cards and site-facing Maze controls are React-owned. The original static game DOM IDs remain as the engine compatibility boundary. The remaining imperative modules are limited to the independent simulation/render/input lifecycle and canvas-based visual effects; they are not UI controllers. Do not move high-frequency game-loop updates into React state.


## Maze Hub vs. Maze runtime

`/maze` is the lightweight Maze Hub route. It owns the former Home market summary and hero slider. `/maze.html` and `/play` are aliases for the Maze runtime route inside the same SPA document; they no longer create a document-navigation boundary. The bottom-dock Maze action opens the Hub; Create opens `/maze.html?view=create` through the shared router and transition coordinator.


## Game Feed integration boundary

The site Home route reads the existing read-only `GET /rooms` snapshot through `src/features/home/game-feed-api.ts`. It does not create another WebSocket client or Game Engine. This currently supports live-room cards, joinable waiting-room cards and short-lived recent result summaries. It does not provide a durable replay, recording, social interactions or a persistent post feed; those require separate server-side features.

## Shared route surface and Engine lifecycle

All site and Maze destinations use one route tree and one geometry contract:

- `.route-page` is the persistent outer site frame.
- `main.feature-page-shell` is the only content surface and the only vertical scroll owner.
- Each destination is one direct `.route-view` child. The persistent `#mazeApp.route-view` is the Maze destination; it is not rendered through a portal or a separate document root.
- `RouteScrollbar` measures the same `feature-page-shell` for Home, Explore, Profile, Maze Hub, Create, Rooms, Waiting Room, Live and gameplay.

`MazeFrame.tsx` keeps `#mazeApp` and the engine's static DOM contract mounted after the first authenticated activation because `engine/dom.ts` caches DOM nodes. Only the route-scoped runtime is mounted/disposed: `engine-entry.ts` owns input/window listeners, RAF work, timers and WebSocket connection cleanup. The initial Create / Rooms / Live tab is read from `?view=` by `maze-ui-store.ts` before the first render. The route content remains behind the boot state until `data-maze-engine-ready` is set.

Game-only presentation classes (`in-menu`, `wide`, `spectating`) and the board-size CSS variable (`--v`) live on `#mazeApp`; the Engine does not change global body classes or global layout variables. The `--v` inline value is removed at Runtime disposal. The outer content frame, header, dock, gutters and scrollbar are shared site chrome. Create and Lobby roots do not add a second copy of the shared surface padding; each consumes the same content box. Gameplay locks the same content scroller temporarily, rather than introducing another frame or nested scroller. `fitLayout()` uses `#mazeApp` for the content width and the `feature-page-shell` content-box height (excluding its padding), not the potentially taller menu content height, so the board fits the space between the shared header and dock.

The shared SPA document applies only the saved theme before first paint. It does not pre-apply Maze route state. The Maze route enters through the normal React router and `MazeFrame` initializes its local menu state before the Engine makes its first restore/show-menu decision.

## Menu tab motion ownership

The Create / Rooms / Live panel transition is coordinated by the React `MazeMenu` presentation layer. `CreateGameComponent` remains a DOM-free state adapter and publishes the selected view through its transition callback; `MazeMenu` applies a named View Transition when supported, or a short CSS exit/enter fallback otherwise. Only the active `.cg-view` receives the transition name. The active menu panel is the inner animated surface; the shared site frame, single route scroller, tabs rail, `CreateWizard` mount, preview Canvas, LobbyHub, room store and WebSocket lifecycle remain stable.


## Shared motion system

All registered site routes, including Maze, use the same same-document transition coordinator. Native View Transitions animate the active content surface when the destination lazy chunk is already resolved; first visits to an unloaded route use a brief CSS exit/entry fallback so Suspense does not produce an empty transition snapshot. Persistent site chrome stays mounted. Maze's persistent route view is kept parked inside the same content surface while another route is active; its engine resources are disposed during that route transition.

Create / Rooms / Live panel transitions are owned by the React `MazeMenu` presentation layer. `CreateGameComponent` remains a DOM-free state adapter and the panel switch does not unmount the persistent wizard preview or canvas. Reduced-motion preferences disable these transitions.
