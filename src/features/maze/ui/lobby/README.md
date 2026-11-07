# React lobby UI

`MazeMenu.tsx` renders Create, Rooms, Room Details and Live. `LobbyHub` is a protocol/data coordinator only; it publishes lobby snapshots through `maze-ui-store.ts`. The room mirror (`LobbyStore`), sort/filter helpers and canvas thumbnail renderer are presentation-independent support modules.
