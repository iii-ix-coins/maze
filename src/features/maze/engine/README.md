# Maze engine

The existing TypeScript engine source is now in this root Vite source tree. Canvas rendering, simulation, input, saved-game format and WebSocket message framing stay in their existing imperative engine modules. `MazePage.tsx` mounts the original DOM contract and `engine-entry.ts` starts the engine after React commits that DOM.

Do not move game-loop updates into React state. React should own page composition and route lifecycle; the engine owns requestAnimationFrame, Canvas and multiplayer state.
