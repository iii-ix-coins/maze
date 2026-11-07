# Home feature — native React route

The active Home route no longer runs the previous Home DOM-construction scripts.
`HomePage.tsx` owns the page lifecycle; `SiteChromeHosts` composes the site
regions; `SiteNavigation` owns menu state; `ThemeSwitcher` and
`GameViewSwitcher` are accessible React controls; and `InteractionBar` owns
Views / Likes / Shares / Share Modal state.

Existing CSS selectors, IDs, public asset URLs, theme storage keys, API
endpoints, request methods and polling cadence are preserved. The old source
under `legacy-scripts/` is retained only as a migration baseline/rollback
reference and is not booted by the active Home or Maze routes.

Remaining feature migration: the Coin page and dormant legacy feature panels
must be moved into React when their routes are activated. The platform's
Node.js services and API contracts are intentionally outside the React app.
