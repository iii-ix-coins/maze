# Market feature — React

`MarketSummary` and `MarketPage` now own the market UI. The shared `useMarketData` hook preserves the existing `GET /api/jupiter-market` request, `cache: no-store`, `Accept: application/json` header, and 30-second refresh cadence. Payload unwrapping and number formatting mirror the legacy implementation.

The feature does not call any new service and does not transform or persist backend state.
