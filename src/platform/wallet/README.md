# Solana wallet platform

The wallet platform owns wallet connection and account-state integration. It must not depend on Maze Game Loop, simulation state, room state, or the multiplayer protocol.

## Connection implementation

- **Connection SDK:** Reown AppKit with its Solana adapter.
- **UI:** Official, unmodified Reown AppKit modal and internal views.
- **Navigation trigger:** The existing Maze-owned `WalletConnectButton` remains unchanged. It opens the official Reown modal through AppKit's `open()` API and displays the current Solana address/status.
- **Browser wallet discovery:** Wallet integrations exposed by the Solana adapter.
- **Remote and mobile connection:** WalletConnect through Reown's wallet network and QR/deep-link flow.
- **Supported chain:** Solana mainnet only.
- **Theme:** AppKit uses its defaults, including system color-scheme behavior. Maze theme tokens do not alter the Reown modal.
- **Existing Solana SDK:** `@solana/web3.js` remains installed and unchanged for current SPL-token and engine consumers.

No AppKit `themeMode`, `themeVariables`, feature overrides, or custom Shadow DOM styles are configured. The `metadata` object identifies Maze to wallets and supplies the actual current origin; it is not a modal theme override.

## Setup

1. Install the dependencies after applying the patch:

   ```powershell
   npm install
   ```

2. Create a project at [Reown Dashboard](https://dashboard.reown.com) and copy its public Project ID.

3. Add the public Project ID to the local `.env` file and production **build environment**:

   ```dotenv
   VITE_REOWN_PROJECT_ID=your_public_project_id
   ```

4. Add each exact serving origin (production and development, if used) to the project's allowed domains in the Reown Dashboard.

5. Build and verify:

   ```powershell
   npm run check:layout
   npm run typecheck
   npm run build:all
   npm run test:all
   ```

`VITE_REOWN_PROJECT_ID` is intentionally public because Vite embeds `VITE_*` values into the browser bundle. It is an application identifier, not a private API secret. Never put a seed phrase, private key, or server secret in a `VITE_*` variable.

If the Project ID is missing, the existing navigation button remains visibly disabled and explains which build variable is missing; it does not pretend a wallet is connected.

## Modal visibility signal

The AppKit state subscription sets `data-wallet-modal="open"` on the document root while the modal is open. `MazeBackground` uses this attribute to pause its per-frame SVG camera work. This signal does not style or modify AppKit's UI and should be retained unless the MazeBackground optimization is removed separately.

## Connection is not authentication

Connecting only makes the public Solana address available to the client. It does **not** sign a message, create a Maze account, establish a server session, or authorize an action.

The `src/platform/identity` boundary remains reserved for a later SIWS authentication implementation. That implementation must add server-issued one-time challenges, strict domain/origin validation, signature verification on the server, replay protection, and a secure session lifecycle before any connected address is treated as an authenticated user.

No transaction is requested by the current connection flow. Do not request or store private keys or seed phrases.

## Future wallet coverage

Reown AppKit is used because it combines browser wallet discovery with WalletConnect's QR/mobile path while allowing the existing Maze navigation button to remain unchanged. If device testing identifies Android wallets that are only reachable through Solana Mobile Wallet Adapter (MWA), add MWA as a separate transport adapter inside this boundary. Do not change the Maze engine to add it.
