# Holders feature — React

`HoldersPanel` and `HoldersPage` are the active React views. `useHolders` preserves `GET /api/live-feed/holders?limit=100`, no-store caching, the Accept header, request cancellation/stale-request guard, data-version comparison and five-second refresh cadence. Rows are keyed by wallet and styled from the same amount-based heat and deterministic wallet hue calculations as the prior UI.

The home page shows the live Top 100 preview; `/holders.html` shows the full holders view. Backend services and persisted state remain unchanged.
