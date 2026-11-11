# Wallet platform boundary

Wallet adapters belong here and must not be coupled to Maze Game Loop or room protocol internals.

The first supported integration target is Solana, consistent with the existing chain tooling. A production adapter must use a wallet-standard compatible client integration and a server-verified sign-in challenge. The browser must never request, transmit, persist or log a seed phrase or private key.

A successful wallet signature proves control of an address for the exact challenge only. It does not automatically authorize transactions, account recovery, token transfers or privileged application actions.

No wallet-connect UI or authentication backend is enabled by this scaffold.
