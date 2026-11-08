# Maze adapters

The active `/maze.html` route is rendered by the shared Vite + React application. The independent Maze engine mounts after React commits the expected DOM contract. Keep its existing WebSocket protocol, simulation lifecycle and DOM IDs stable; do not add a second page bootstrap or legacy standalone HTML entry.
