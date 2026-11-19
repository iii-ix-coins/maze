# Home feature — native React route

The active Home route is composed from React-owned feature sections. `SiteChromeHosts` owns the common page lifecycle, navigation, brand header and interaction dock. `MarketSummary` presents the market snapshot and `HoldersPanel` presents the Top 100 holders preview.

The Home route does not include a Live Feed rail or any Live Feed polling. Holder data is owned by the Holders feature and loaded through `GET /api/holders/top?limit=100`.
