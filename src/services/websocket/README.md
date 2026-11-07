# WebSocket integration

The browser client source is `src/features/maze/net/multiplayer-client.ts`. It is imported by the root Vite build. Keep its protocol, message order, reconnect behavior and room semantics unchanged. The separate Node server is in `engines/maze-server`.
