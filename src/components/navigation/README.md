# Navigation components

The active site navigation is implemented in React:

- `SiteNavigation.tsx` owns the Home, Explore, Create, Notifications and Profile dock actions, active route states and notification panel interaction.
- `SiteChromeHosts.tsx` mounts the independent top-left brand and the navigation host.
- `ThemeSwitcher.tsx` owns the vertical three-theme radio control and delegates changes to the central theme engine.
- The dock order is Home, Explore, Create, Notifications, Profile, then the compact vertical Theme selector at the far right. Create continues to open the existing Maze Create view.
- `ExplorePage.tsx` provides the only site-level entry to the existing Maze Live and Rooms views.
- The Profile destination is always present; the wallet connection CTA remains in the Profile page and is shown for anonymous users only.

## Navigation icon assets

Place optional SVG icons in `public/css/images/`. The app will use them when present and fall back to its built-in SVG artwork if a file is missing:

| Action | Public URL | File path |
|---|---|---|
| Home | `/css/images/nav-home.svg` | `public/css/images/nav-home.svg` |
| Explore | `/css/images/nav-explore.svg` | `public/css/images/nav-explore.svg` |
| Create | `/css/images/nav-create.svg` | `public/css/images/nav-create.svg` |
| Notifications | `/css/images/nav-notifications.svg` | `public/css/images/nav-notifications.svg` |
| Profile | `/css/images/nav-profile.svg` | `public/css/images/nav-profile.svg` |

Square SVGs with a transparent background and `viewBox="0 0 24 24"` are recommended. The default display size is 23×23 px (22×22 px on small screens).

## Visual rules

- Dock surface and icon buttons use a diagonal chamfer on the upper-left and lower-right corners via `clip-path`; `border-radius` is not used for these shapes.
- Theme choices stay vertical. Each choice is square: 18×18 px normally and 16×16 px on very narrow screens. The same chamfer direction is used.
- Pointer hover styling and visible text labels/tooltips are removed. Semantic `aria-label` values and keyboard focus indicators remain.
- The clipped dock background is rendered on `nav::before`, rather than clipping the navigation container itself, so the Notifications popover can extend above the dock without being cropped.

Navigation destinations, wallet sign-in behavior and theme storage contracts remain unchanged. The top-right Create / Rooms / Live switcher is retired; Live and Rooms are reached from Explore.
