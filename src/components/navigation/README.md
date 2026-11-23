# Navigation components

The active site navigation is implemented in React:

- `SiteNavigation.tsx` owns the responsive bottom dock, active route states and the More menu.
- `SiteChromeHosts.tsx` mounts the independent top-left brand and top-right game/theme controls.
- `ThemeSwitcher.tsx` owns the site theme radio control and writes the established document theme/storage contract.
- `GameViewSwitcher.tsx` owns the Create / Rooms / Live route selector.
- The Profile destination is always present in the dock; the wallet connection CTA is rendered in the centered Profile page state only when the identity is anonymous.

Navigation destinations, public asset paths, wallet sign-in behavior and keyboard semantics remain React-owned. The previous imperative navigation module and its duplicate copies have been removed.
