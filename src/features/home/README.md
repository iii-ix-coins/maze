# Home feature — native React route

The active Home route is now composed from React-owned feature sections. `SiteChromeHosts` owns the common page lifecycle, navigation, brand header and interaction dock. `MarketSummary`, `LiveFeedPanel` and `HoldersPanel` own the market snapshot, buyer/holder rail and Top 100 table respectively.

The route uses only existing API contracts and service responses. The previous DOM controllers and their duplicate public copies have been removed; the active route is React-owned.
