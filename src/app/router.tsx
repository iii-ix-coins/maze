import { lazy, Suspense } from 'react';

import { NotFoundPage } from '../components/layout/NotFoundPage';
import { RouteScrollbar } from '../components/layout/RouteScrollbar';

import { usePathname } from './navigation';
import { loadExplorePage, loadHomePage, loadMazeHubPage, loadProfilePage } from './route-loaders';
import { resolveSiteRoute } from './routes';

const HomePage = lazy(loadHomePage);
const ExplorePage = lazy(loadExplorePage);
const MazeHubPage = lazy(loadMazeHubPage);
const ProfilePage = lazy(loadProfilePage);

const PAGE_COMPONENTS = {
  home: HomePage,
  'maze-hub': MazeHubPage,
  explore: ExplorePage,
  profile: ProfilePage,
};

/** One React router dispatches all active site features without touching API routes. */
export function AppRouter() {
  const pathname = usePathname();
  const route = resolveSiteRoute(pathname);

  // The Maze document owns its own persistent frame and scrollbar through the
  // #maze-root portal. Do not create an empty site route frame (or a second
  // orphaned RouteScrollbar) for this route.
  if (route?.id === 'maze') return null;

  const Page = route
    ? PAGE_COMPONENTS[route.page as keyof typeof PAGE_COMPONENTS]
    : undefined;

  if (!route || !Page) {
    return <NotFoundPage />;
  }

  const isHomePage = route.id === 'home';
  const isMazeHubPage = route.id === 'maze-hub';

  return (
    <div
      className={`route-page${isHomePage ? ' route-page--home' : ''}${isMazeHubPage ? ' route-page--maze-hub' : ''}`}
      data-route-page={pathname}
      onAnimationEnd={(event) => {
        // Clear the first-visit CSS fallback only when the new page surface
        // finishes its entrance; nested component animations must not clear it.
        if (event.target === event.currentTarget.firstElementChild) {
          delete document.documentElement.dataset.siteRouteFallback;
        }
      }}
    >
      {/* Keep this frame and its border mounted; only the keyed page content changes. */}
      <Suspense fallback={null}>
        <Page key={pathname} />
      </Suspense>
      {/* The scrollbar stays mounted and rebinds to the new direct child scroller. */}
      <RouteScrollbar />
    </div>
  );
}