# Market feature — React

`MarketSummary` and `MarketPage` now own the market UI. The shared `useMarketData` hook preserves the existing `GET /api/jupiter-market` request, `cache: no-store`, `Accept: application/json` header, and 30-second refresh cadence. Payload unwrapping and number formatting mirror the legacy implementation.

The live coin price is read from the existing `GET /api/live-price` endpoint, which exposes the latest PCLQCH engine snapshot. Price refresh is visibility-aware and runs every 5 seconds while the summary is mounted; the Jupiter market request remains on its existing 30-second cadence. The feature does not start another pricing engine, call upstream price providers from the browser, or persist backend state.
