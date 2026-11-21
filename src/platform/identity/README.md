# Identity platform

Identity is the single React-level source of truth for Maze account authentication. It is intentionally separate from Reown's wallet connection state and from the Maze simulation / multiplayer runtime.

## Runtime boundaries

- `IdentityProvider.tsx` performs one session restore request when the React application mounts. It does not poll and does not load the wallet SDK.
- `identity-client.ts` owns the typed same-origin HTTP contract.
- `WalletConnectRuntime.tsx` exposes only a narrow `signMessage(Uint8Array)` capability to the navigation component. The AppKit runtime remains lazy-loaded.
- `WalletConnectButton.tsx` starts authentication only after an explicit connect/sign-in action. A connected address alone is never treated as an authenticated account.
- `ProfilePage.tsx` reads and updates the account through `useIdentity()`.
- `shared/identity/identity-routes.js` issues short-lived SIWS challenges, verifies Ed25519 signatures on the server, and manages HttpOnly sessions.
- `shared/identity/identity-store.js` persists users, wallet identities, challenges and sessions in a dedicated SQLite database. Server handlers expose reusable `requireSession` middleware and `getSessionUser(req)` for future same-origin HTTP and WebSocket handshake authorization.

## Authentication flow

1. User explicitly connects a Solana wallet with the existing Reown modal.
2. Server issues a five-minute SIWS-formatted challenge bound to the exact configured origin and wallet address.
3. The connected wallet signs the exact UTF-8 challenge with Reown's Solana `signMessage` provider method; this is the raw-message fallback in Solana's current guidance. No transaction is created or sent. Wallets with the newer off-chain-message feature should be upgraded to that envelope when the active Reown provider exposes it; hardware-wallet users without message-signing support are not silently sent through a transaction flow.
4. Server verifies the 64-byte Ed25519 signature against the public key extracted from the challenged wallet address.
5. A transaction atomically consumes the one-time nonce, creates or retrieves the user, and stores a hash of a random session token.
6. Server sets an HttpOnly, SameSite=Lax cookie. The raw session token is never returned to JavaScript or stored in LocalStorage.
7. IdentityProvider stores the returned public account state in memory and sends the user to `/profile` after successful explicit login.

Session restoration on refresh does not navigate. It only restores the current account state.

## Security and operational notes

- `IDENTITY_ALLOWED_ORIGINS` must contain the exact comma-separated browser origins that may authenticate. In production, configure the production site origin only. `VITE_APP_URL` is also accepted as a single configured origin.
- Development mode automatically permits localhost origins on ports 5173 and 5000. These development origins are not automatically enabled in production.
- Production uses a `__Host-maze_session` cookie (`Secure`, `HttpOnly`, `Path=/`, no `Domain`, `SameSite=Lax`). Set `AUTH_COOKIE_SECURE=true` for HTTPS staging when `NODE_ENV` is not `production`.
- Mutating auth routes require an exact allow-listed `Origin`; cross-site Fetch Metadata is rejected. Configure `TRUST_PROXY=true` only behind a trusted reverse proxy so IP-based rate limits use the real client address.
- Challenges expire after five minutes by default. Session lifetime is 30 days by default. Both values can be adjusted with the `IDENTITY_*` environment variables. The mainnet SIWS message uses the wallet-compatible `solana:mainnet` chain identifier.
- Username policy is intentionally conservative: 3–20 lowercase ASCII letters, numbers or underscores; it is unique case-insensitively. Avatar URLs must be public HTTPS URLs. If no image is set or it fails to load, the UI generates a deterministic local identicon.
- No profile image is downloaded or proxied by the server. The browser uses `referrerPolicy="no-referrer"` when loading a user's HTTPS avatar URL.
- The Identity database defaults to `shared/data/identity.sqlite3`, which is ignored by Git. Keep this file on persistent storage and back it up. SQLite/WAL is suitable for the current single-host Express deployment. Before running multiple application instances on independent disks, move this store and the session/challenge tables to a shared transactional database such as PostgreSQL.
- `Wallet Disconnect` is separate from `Logout`: disconnecting the transport does not revoke a valid account session. Logout revokes the current server session but leaves the wallet connected.
- Authentication does not yet protect Create Game, Room Join or WebSocket messages. Those actions must not be advertised as account-protected until the Maze WebSocket server independently validates the same server session through the shared Identity store. Keep the WebSocket handshake same-origin so the host-only `__Host-` cookie is sent; do not weaken the cookie by adding a broad Domain attribute. Client-only guards are not authorization.

## API routes

All paths are declared in `shared/api-routes.json`:

- `POST /api/auth/challenge`
- `POST /api/auth/verify`
- `GET /api/auth/session`
- `POST /api/auth/logout`
- `PATCH /api/auth/profile`

## Validation

After installing the repository dependencies, run:

```sh
npm run check:layout
npm run test:identity
npm run typecheck
npm run build:all
npm run test:all
```

Also test the full login flow with at least one injected browser wallet and one WalletConnect mobile wallet. Confirm signature rejection, wallet switching, session restoration, logout and profile update. The automated code checks cannot substitute for real wallet-provider testing.
