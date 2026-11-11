# Solana wallet platform

The wallet platform owns wallet discovery and connection UI. It must not depend on Maze Game Loop, simulation state, room state, or the multiplayer protocol.

## Current connection implementation

- **Connection SDK:** Reown AppKit with its Solana adapter.
- **Browser wallet discovery:** Wallet Standard / injected Solana wallet integrations exposed through the adapter.
- **Remote and mobile connection:** WalletConnect through Reown's wallet network and QR/deep-link flow.
- **Supported chain:** Solana mainnet only.
- **UI entry point:** `WalletConnectButton` inside the existing `SiteNavigation`.
- **Theme:** the AppKit modal follows the existing `ThemeBridgeProvider` theme (dark, light, grass) and uses Maze's mint/grass accent.
- **Existing Solana SDK:** `@solana/web3.js` remains installed and unchanged for current SPL-token and engine consumers.

Reown documents direct connections to 40+ major wallets and WalletConnect-based connections. This is broad coverage, not a guarantee that literally every Solana-capable wallet is supported. Wallet availability depends on each wallet's connector support and platform.

## Setup

1. Install the dependencies after applying the patch:

   ```powershell
   npm install
   ```

   This updates `package-lock.json` to match `package.json`.

2. Create a project at [Reown Dashboard](https://dashboard.reown.com) and copy its public Project ID.

3. Add these values to the local `.env` file and to the production **build environment**:

   ```dotenv
   VITE_REOWN_PROJECT_ID=your_public_project_id
   VITE_APP_URL=https://hollld.fun
   ```

4. Add the exact production origin (and development origin if needed) to the project's allowed domains in the Reown Dashboard.

5. Build and verify:

   ```powershell
   npm run check:layout
   npm run typecheck
   npm run build:all
   npm run test:all
   ```

`VITE_REOWN_PROJECT_ID` is intentionally public because Vite embeds `VITE_*` values into the browser bundle. It is an application identifier, not a private API secret. Never put a seed phrase, private key, or server secret in a `VITE_*` variable.

If the Project ID is missing, the navigation button remains visibly disabled and explains which build variable is missing; it does not pretend a wallet is connected.

## Connection is not authentication

Connecting only makes the public Solana address available to the client. It does **not** sign a message, create a Maze account, establish a server session, or authorize an action.

The `src/platform/identity` boundary remains reserved for a later SIWS authentication implementation. That implementation must add server-issued one-time challenges, strict domain/origin validation, signature verification on the server, replay protection, and a secure session lifecycle before any connected address is treated as an authenticated user.

No transaction is requested by the current connection flow. Do not request or store private keys or seed phrases.

## Future wallet coverage

Reown AppKit is the first integration because it combines browser wallet discovery with WalletConnect's QR/mobile path while allowing the existing navigation button to remain Maze-owned. If device testing identifies Android wallets that are only reachable through Solana Mobile Wallet Adapter (MWA), add MWA as a separate transport adapter inside this boundary. Do not replace the existing AppKit flow or change the Maze engine to add it.
