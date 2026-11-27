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


## One shared route and content architecture

`site.css` defines one site frame width shared by `#site-topbar`, `#site-header`, `.route-page` and the bottom dock. The unkeyed `.route-page` is the one persistent outer frame for every destination. It contains exactly one `main.feature-page-shell`, which owns the content gutters, vertical scrolling, overscroll policy and the custom scrollbar. Every destination renders one direct `.route-view` child of that surface.

Maze is not a portal, a sibling application root or a second viewport. `MazeFrame` renders the persistent `#mazeApp.route-view` directly inside the same `feature-page-shell`; the Create, Rooms, Waiting Room, Live and gameplay states remain descendants of that route view. The Engine keeps its DOM contract mounted after first activation because it caches the original nodes, but mounts/disposes its listeners, RAF loop and WebSocket with the Maze route lifecycle. Game-only classes such as `in-menu`, `wide` and `spectating` belong to `#mazeApp`, never `document.body`.

The only scroll owner is `.feature-page-shell`. The custom `RouteScrollbar` measures that same element for all pages. Gameplay temporarily locks that same scroller to protect board/camera input; it does not add a nested scroll container or a second frame. `fitLayout()` reads the board width from `#mazeApp` and the available height from the shared surface content box, so a long menu cannot inflate the gameplay viewport.

All registered destinations, including `/maze.html` and `/play`, are soft routes in the same SPA document. The shared transition coordinator animates the active `.route-view` through native View Transitions where supported, with the existing WAAPI/CSS fallback and reduced-motion handling. Site chrome remains mounted throughout route changes.
