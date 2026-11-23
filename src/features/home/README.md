# Home feature — native React route

The active Home route is composed from React-owned feature sections. `SiteChromeHosts` owns the common page lifecycle, navigation and independent brand header. `MarketSummary` presents the market snapshot.

The Home route does not include a Live Feed rail, Live Feed polling, or a Holders preview. Holder-specific page, API, snapshot service, state and background engine have been retired. The upstream market provider payload may still contain its original `holderCount` field; it is retained as provider data only and is not consumed by a Holders feature.
