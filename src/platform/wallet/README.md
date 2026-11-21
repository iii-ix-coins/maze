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

After an explicit connect action, Maze asks the wallet to sign a short-lived server-issued Sign-In With Solana (SIWS) message. The current Reown Solana provider bridge uses `signMessage`, the raw-message fallback described by Solana; off-chain-message envelopes are preferred when exposed by the wallet/provider, but are not assumed to be available through the current bridge. The signature is verified by the Express server. This is a message signature, not a blockchain transaction; it does not transfer assets or pay a network fee. The wallet's `signMessage` capability is passed to Identity Core through a narrow function and is never exposed to the game engine.

A signature is accepted only for its exact challenge, wallet address, configured origin and expiry. The mainnet SIWS message uses `Chain ID: solana:mainnet`, the identifier accepted by current Solana wallet sign-in flows. The nonce is consumed atomically. The server then issues a session cookie with `HttpOnly`, `SameSite=Lax`, and (in production) `Secure` attributes.

## Disconnect and logout

Wallet disconnect closes the wallet transport only. It does not revoke the Maze account session. Logout revokes the server session and clears the account cookie; it intentionally does not force a wallet disconnect. This separation keeps account identity and wallet connection state independent.

## Modal visibility signal

The AppKit state subscription sets `data-wallet-modal="open"` on the document root while the modal is open. `MazeBackground` uses this attribute to pause its per-frame SVG camera work. Retain this signal unless the MazeBackground optimization is removed separately.

## Future wallet coverage

If device testing identifies Android wallets that are only reachable through Solana Mobile Wallet Adapter (MWA), add MWA as a separate transport adapter inside this boundary. Do not change the Maze engine to add it.
