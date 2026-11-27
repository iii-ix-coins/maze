# Navigation components

The active site navigation is implemented in React:

- `SiteNavigation.tsx` owns the Home, Explore, Maze, Create, Notifications and Profile dock actions, active route states and notification panel interaction.
- `SiteChromeHosts.tsx` mounts the shared header (left brand, centered theme selector, right token balance) and the bottom navigation host.
- `ThemeSwitcher.tsx` owns the compact horizontal three-theme radio control in the center of the header and delegates changes to the central theme engine.
- The dock order is Home, Explore, Maze, Create, Notifications and Profile. The theme selector is centered in the header; the configured token balance is aligned to the header right. Maze opens the separate Maze Hub route (`/maze`); Create continues to open the existing Maze runtime Create view (`/maze.html?view=create`).
- `ExplorePage.tsx` provides the only site-level entry to the existing Maze Live and Rooms views.
- The Profile destination is always present; the wallet control in Profile shows Connect while anonymous and the authenticated account menu (including Disconnect & log out) after sign-in. The former Home market summary and hero slider now live in Maze Hub (`/maze`). The header balance shows the connected Solana wallet’s configured mint amount, whether signed in or signed out; when no wallet is connected it shows a placeholder.

## Navigation icon assets

Place optional SVG icons in `public/css/images/`. The app will use them when present and fall back to its built-in SVG artwork if a file is missing:

| Action | Public URL | File path |
|---|---|---|
| Maze | `/css/images/nav/nav-maze.svg` | `public/css/images/nav/nav-maze.svg` |
| Home | `/css/images/nav/nav-home.svg` | `public/css/images/nav/nav-home.svg` |
| Explore | `/css/images/nav/nav-explore.svg` | `public/css/images/nav/nav-explore.svg` |
| Create | `/css/images/nav/nav-create.svg` | `public/css/images/nav/nav-create.svg` |
| Notifications | `/css/images/nav/nav-notifications.svg` | `public/css/images/nav/nav-notifications.svg` |
| Profile | `/css/images/nav/nav-profile.svg` | `public/css/images/nav/nav-profile.svg` |

Square SVGs with a transparent background and `viewBox="0 0 24 24"` are recommended. The default display size is 23×23 px (22×22 px on small screens).

## Visual rules

- Dock surface and icon buttons use a diagonal chamfer on the upper-left and lower-right corners via `clip-path`; `border-radius` is not used for these shapes.
- Theme choices are text-only G/D/L buttons centered in the header. Each button is 21×21 px on desktop and 19×19 px on mobile; active state uses a 2px red border while the button background remains the current theme background.
- Pointer hover styling and visible text labels/tooltips are removed. Semantic `aria-label` values and keyboard focus indicators remain.
- The clipped dock background is rendered on `nav::before`, rather than clipping the navigation container itself, so the Notifications popover can extend above the dock without being cropped.

Navigation destinations, wallet sign-in behavior and theme storage contracts remain unchanged. The top-right Create / Rooms / Live switcher is retired; Live and Rooms are reached from Explore.


## Shared three-frame site geometry

`site.css` owns one `--site-frame-width` token shared by `#site-topbar`, `#site-header` and `.route-page`. The topbar height is half the dock height; its top inset shares the dock's bottom inset. Topbar and route content use the same transparent chamfered border language as the dock. Normal site routes use a viewport-locked document with no page-level scrolling. The outer `.route-page` frame remains fixed between the topbar and dock; only its direct `.feature-page-shell` child scrolls vertically with contained overscroll. Route changes reset that inner scroller, never `window.scrollTo`. The `/maze.html` gameplay shell remains outside this route-frame geometry so its in-flow navigation and game viewport are preserved. Route-frame CSS is selected by `.route-page` itself and does not depend on `body.in-menu`, which is mutable Maze menu state. SPA transitions are allowed only when both the current and destination routes are marked `soft`; entering or leaving the standalone Maze runtime (`/maze.html` and `/play`) uses document navigation in both directions. The route frame stroke is layered above the inner scroll container so its right border remains visible when the native scrollbar occupies the content edge; on narrow viewports the shared top/bottom frame inset remains non-zero and scales with viewport width.
