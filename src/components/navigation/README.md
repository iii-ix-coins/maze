# Navigation components

The active site navigation is implemented in React:

- `SiteNavigation.tsx` owns nav, dropdown and mobile-menu state.
- `ThemeSwitcher.tsx` owns the site theme radio control and writes the established document theme/storage contract.
- `GameViewSwitcher.tsx` owns the Create / Rooms / Live route selector.

CSS classes, navigation destinations, public asset paths and keyboard semantics are retained. The prior imperative navigation module remains only under `src/features/home/legacy-scripts/` as a comparison reference; it is not loaded by the active application.
