# Token / Coin feature — React

`CoinPage` is the React implementation of the token detail route (`/coin.html`). It renders identity, mint, overview, market periods, trading flow, audit, project and community details from the existing `/api/jupiter-market` response. Its market refresh remains 30 seconds. The price sparkline reads the existing `/api/jupiter-market/history?limit=240` endpoint and refreshes every 60 seconds while the document is visible.

No API path, method, query, backend response shape or backend calculation was changed.
