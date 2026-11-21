# Solana wallet platform

The wallet platform owns wallet connection and account-state integration. It must not depend on Maze Game Loop, simulation state, room state, or the multiplayer protocol.

## Connection implementation

- **Connection SDK:** Reown AppKit with its Solana adapter.
- **UI:** Official Reown AppKit modal and internal views.
- **Navigation trigger:** The Maze-owned `WalletConnectButton` opens the official modal through AppKit's `open()` API.
- **Browser wallet discovery:** Wallet integrations exposed by the Solana adapter.
- **Remote and mobile connection:** WalletConnect through Reown's wallet network and QR/deep-link flow.
- **Supported chain:** Solana mainnet.
- **Theme:** AppKit uses its defaults, including system color-scheme behavior.
- **Existing Solana SDK:** `@solana/web3.js` remains installed and unchanged for current SPL-token and engine consumers.

The AppKit runtime is loaded on demand or during browser idle time only when an existing wallet session is detected. It is intentionally kept out of the initial route bundle.

## Setup

1. Install dependencies with `npm install`.
2. Create a project at [Reown Dashboard](https://dashboard.reown.com) and copy its public Project ID.
3. Add `VITE_REOWN_PROJECT_ID` to the local environment and production build environment.
4. Add each exact serving origin to the Reown Dashboard's allowed-domain list.
5. Configure `IDENTITY_ALLOWED_ORIGINS` for the same exact production origin on the Express server.

`VITE_REOWN_PROJECT_ID` is intentionally public because Vite embeds `VITE_*` values into the browser bundle. Never put a seed phrase, private key, server secret or session secret in a `VITE_*` variable.

If the Project ID is missing, the existing navigation button remains visibly disabled and explains which build variable is missing.

## Connection is not authentication

Connecting only makes a public Solana address available to the client. It does not by itself sign a message, create a Maze account, establish a server session, or authorize an action.

The primary `Connect Wallet` action owns the whole sign-in intent: after AppKit reports a successful connection, Maze automatically starts authentication. A connected-but-anonymous wallet also uses the primary button to retry authentication; the user no longer needs a separate `Sign in to Maze` menu item. Identity Core prefers `solana:signIn` when the active provider exposes that Wallet Standard capability and validates its returned account, message and signature. The current Reown Solana provider API commonly exposes `signMessage` instead, so the bridge retains that compatible fallback. In either case the user sees only one Maze action, and only one cryptographic proof is requested by Maze. AppKit's initial wallet connection/permission step is a separate transport authorization and must not be described as a second message signature. The message signature is not a blockchain transaction; it does not transfer assets or pay a network fee. Signing capabilities are passed to Identity Core through narrow functions and are never exposed to the game engine.

A signature is accepted only for its exact challenge, wallet address, configured origin and expiry. The mainnet SIWS message uses `Chain ID: solana:mainnet`, the identifier accepted by current Solana wallet sign-in flows. The nonce is consumed atomically. The server then issues a session cookie with `HttpOnly`, `SameSite=Lax`, and (in production) `Secure` attributes.

## Unified disconnect and logout

The Maze account menu exposes a single teardown action. When both the Maze session and Solana wallet are active, the action is labelled `Disconnect & log out`: it revokes the server session first and then closes the AppKit wallet connection. If server revocation fails, the wallet is deliberately left connected; if revocation succeeds but transport disconnect fails, the account stays signed out and the UI offers the remaining `Disconnect wallet` action. When only one state is active, the same action ends only that state (`Log out` for a disconnected wallet or `Disconnect wallet` for an anonymous connected wallet).

A stable disconnect made through the Reown modal or directly in the wallet is synchronized by revoking the Maze session. Switching the active Solana account while authenticated also revokes the previous account session; the newly selected wallet must explicitly sign in. Transient `connecting` and `reconnecting` states are ignored. Initial page restoration is different: the app does not infer a deliberate disconnect merely because the wallet runtime has not restored yet, so a valid server account session can still be restored.

## Modal visibility signal

The AppKit state subscription sets `data-wallet-modal="open"` on the document root while the modal is open. `MazeBackground` uses this attribute to pause its per-frame SVG camera work. Retain this signal unless the MazeBackground optimization is removed separately.

## Future wallet coverage

If device testing identifies Android wallets that are only reachable through Solana Mobile Wallet Adapter (MWA), add MWA as a separate transport adapter inside this boundary. Do not change the Maze engine to add it.
