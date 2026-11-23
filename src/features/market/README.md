# Home market snapshot

`MarketSummary` and `useMarketData` are retained only for the compact market snapshot currently embedded in Home. The standalone Market route has been retired. The shared `GET /api/jupiter-market` request, `cache: no-store`, `Accept: application/json` header, 30-second refresh cadence, payload unwrapping and number formatting remain unchanged because Home still consumes this feature.
