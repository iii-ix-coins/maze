# Header Theme + Coin Balance

## Header layout

The site header now has three independent regions:

- Left: the existing Maze wordmark.
- Center: the text-only `ThemeSwitcher` with Grass / Dark / Light choices.
- Right: `HeaderCoinBalance`, showing the configured mint balance for the current wallet address.

The Theme control is not part of the bottom dock. The dock contains exactly six navigation destinations: Home, Explore, Maze, Create, Notifications and Profile.

Desktop theme buttons are 21×21 px (the former 12 px control enlarged by 9 px). On screens at or below 720 px they are 19×19 px (former 10 px plus 9 px). All options use the active theme's root background and foreground; the selected option is indicated only by a 2 px red border.

## Balance behavior

- When signed in, the balance owner is the wallet address attached to the authenticated Maze identity.
- When signed out but a Solana wallet is connected in Reown AppKit, the balance owner is the currently connected wallet.
- When no wallet address is available, the header remains visible and shows `— COIN`; a balance cannot be queried without an owner address.
- A wallet address mismatch between the authenticated identity and currently connected wallet intentionally suppresses the balance rather than showing funds for the wrong account.
- The header listens to `maze:wallet-snapshot` and also initializes a lightweight AppKit account observer during browser idle when Reown is configured. The balance refreshes every 30 seconds and when the tab becomes visible.

## Server-side token balance

`GET /api/token-balance?owner=<solana-address>` resolves the mint from server environment variables (`MINT_ADDRESS`, then the existing fallbacks). The server uses `SOLANA_RPC_URL`; the RPC URL is never placed in a Vite client environment variable. `TOKEN_SYMBOL` controls the display symbol and defaults to `COIN`.

`SolanaTokenBalanceService` uses `getParsedTokenAccountsByOwner(owner, { mint }, 'confirmed')`, verifies returned owner and mint fields, sums the integer raw amounts with `BigInt`, and formats the result using the mint's decimals. If the owner has no token account for that mint, it reads mint decimals from `getTokenSupply` and returns zero. Results are cached briefly and the route is rate-limited.

For production, configure a dedicated Solana RPC provider URL in `SOLANA_RPC_URL`; the public mainnet endpoint is a fallback and may have public rate limits.

## Validation

Run:

- `npm run check:layout`
- `npm run check:css:duplicates`
- `npm run check:svg-theme`
- `npm run test:token-balance`

The balance service tests cover multiple token accounts, zero balance, invalid addresses and integer-safe formatting.
