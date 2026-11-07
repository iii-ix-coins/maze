# Maze frontend feature

React owns the Maze page shell and its complete static interface tree in
`MazePage.tsx` / `MazeMarkup.tsx`. The original DOM IDs, classes, canvas nodes,
control nodes and stylesheet hooks are retained so the established game
runtime can attach without a contract change.

The simulation remains an independent TypeScript engine: Canvas rendering,
maze generation, frame loop, keyboard/pointer/joystick input, save format and
multiplayer message protocol are intentionally not React state. React must not
re-render the high-frequency simulation surface.

Migration work still required inside the UI layer: the Create wizard and the
Rooms / Live / Room views are currently populated and coordinated by the
imperative modules under `ui/`, `lobby/`, `rooms/`, `create-game/`, `live/` and
`race/`. These are the next React conversion targets. Their DOM contracts and
network adapters must be migrated one feature at a time with parity tests.
