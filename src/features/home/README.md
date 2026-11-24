# Home — Game Feed

The root route (`/`) is the social game feed. It reads the existing read-only Maze lobby snapshot (`GET /rooms`) and groups live sessions, joinable waiting rooms and short-lived recent finish summaries. It does not create a second game engine or WebSocket session.

The Maze multiplayer service currently retains recent finish summaries in memory for a short window; these are not replay recordings. Persistent replay support requires a separate server-side event recorder and durable storage.

`game-feed-api.ts` resolves the Maze service HTTP endpoint from the configured multiplayer URL and normalizes its public snapshot. `HomePage.tsx` owns polling, filtering and post presentation.
