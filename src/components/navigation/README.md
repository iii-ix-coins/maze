# Navigation components

The active site navigation is implemented in React:

- `SiteNavigation.tsx` owns the responsive bottom dock, active route states and the More menu.
- `SiteChromeHosts.tsx` mounts the independent top-left brand and top-right appearance control.
- `ThemeSwitcher.tsx` owns the site theme radio control and writes the established document theme/storage contract.
- The dock order is Home, Explore, Create, Notifications, Profile, then the compact borderless vertical theme control at the far right. The Create action continues to open the existing Maze Create view.
- `ExplorePage.tsx` provides the only site-level entry to the existing Maze Live and Rooms views.
- The Profile destination is always present in the dock; the wallet connection CTA is rendered in the centered Profile page state only when the identity is anonymous.

Navigation destinations, public asset paths, wallet sign-in behavior and keyboard semantics remain React-owned. The top-right Create / Rooms / Live switcher has been retired; Live and Rooms are reached from Explore.
