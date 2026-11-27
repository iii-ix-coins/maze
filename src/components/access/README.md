# Authenticated page access

`PageAccessGate` is the only route surface rendered while the server identity
session is not confirmed. It deliberately uses a local, inert visual preview;
preview elements do not mount the target feature, call its data APIs, or expose
interactive controls.

The normal site routes are gated in `src/app/router.tsx`. Maze is gated inside
`MazeFrame` in the same SPA document before the Engine is mounted, so a guest
does not download or start the Maze Engine through React. `IdentityProvider`
only sets `isAuthenticated` after SIWS proof verification is accepted by the
server.

A connected wallet is not sufficient. `anonymous`, `checking`,
`authenticating`, and `error` states remain outside the protected feature tree.
After successful verification, sign-in returns to the exact same-origin path
and query the visitor initially requested.

This is a frontend access boundary. Any sensitive API or server-side operation
must continue to enforce the identity session on the server; hiding a React
route is not a substitute for API authorization.
