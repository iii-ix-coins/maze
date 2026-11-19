# Holders feature — React

`HoldersPanel` and `HoldersPage` are the active React views. `useHolders` reads `GET /api/holders/top?limit=100` with `cache: 'no-store'`, the `Accept: application/json` header, request cancellation and stale-request protection, data-version comparison, and a five-second refresh cadence. Rows are keyed by wallet and styled from amount-based heat and deterministic wallet hue calculations.

The Home page shows the Top 100 preview; `/holders.html` shows the full holders view. The backend snapshot is provided by `HoldersSnapshotService` and the existing Holder Engine database. No Live Feed component or endpoint is involved.
