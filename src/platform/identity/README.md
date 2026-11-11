# Identity platform boundary

This boundary is reserved for account identity and server-issued sessions. It must remain independent from Maze simulation, room state, wallet signing and presentation components.

## Current status

Wallet connection is implemented separately in `src/platform/wallet`. A connected public address is **not** an authenticated Maze user. No registration, SIWS verification, account-linking, or authentication endpoint is implemented yet.

## Production requirements before authentication is enabled

- Internal immutable user ID; wallet addresses are linked identities, not database primary keys.
- Server-issued SIWS challenge with a cryptographically random, one-time nonce, short expiry, exact domain/origin binding, and an explicit human-readable statement.
- Prefer the standardized `solana:signIn` / off-chain message feature when supported; use `solana:signMessage` only as a compatible fallback.
- Verify the exact signed challenge and Ed25519 signature on the server; never trust client-provided verification flags.
- Atomically consume each nonce to prevent replay, including across multiple server instances.
- Secure session lifecycle, rotation, revocation, `HttpOnly`, `Secure` and `SameSite` cookie settings, plus CSRF/origin protection.
- Database uniqueness and transactional linking/unlinking semantics.
- Server-side authorization and audit events; never trust client-only role flags.

A successful wallet signature proves control of an address for that exact challenge only. It does not automatically authorize transactions, account recovery, token transfers or privileged application actions.
