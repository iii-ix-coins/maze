# Maze engine

The TypeScript simulation remains imperative: Canvas rendering, game state, input, saved-game format and WebSocket message framing stay in their existing engine modules. React owns page composition and route lifetime; it does not own high-frequency simulation state.

`engine-entry.ts` is the explicit lifecycle boundary. Importing it does not start a game. `mountMazeEngine()` installs the engine's input/window listeners under one `AbortController`, mounts the lobby coordinator, starts the WebSocket and starts the single simulation `requestAnimationFrame` loop. It returns an idempotent disposer. Disposal saves resumable solo state, settles an active multiplayer session according to the route-exit policy, aborts scoped listeners, cancels the frame loop, clears reconnect work and closes the socket.

The Maze markup remains mounted after the first route visit because `engine/dom.ts` intentionally caches DOM references at module evaluation. Only the runtime is mounted/disposed during soft route and identity transitions; replacing the markup would invalidate those cached references. Do not move game-loop updates into React state or replace the existing simulation, room-store or WebSocket algorithms as part of UI migration.
