import { lazy, Suspense } from 'react';

import { NotFoundPage } from '../components/layout/NotFoundPage';
import { SiteChromeHosts } from '../components/layout/SiteChromeHosts';

import { usePathname } from './navigation';
import { resolveSiteRoute } from './routes';

const HomePage = lazy(() =>
  import('../features/home/HomePage').then((module) => ({
    default: module.HomePage
  }))
);

const ExplorePage = lazy(() =>
  import('../features/explore/ExplorePage').then((module) => ({
    default: module.ExplorePage
  }))
);

const MazeHubPage = lazy(() =>
  import('../features/maze/MazeHubPage').then((module) => ({
    default: module.MazeHubPage
  }))
);


const ProfilePage = lazy(() =>
  import('../features/profile/ProfilePage').then((module) => ({
    default: module.ProfilePage
  }))
);

// Maze itself is mounted by App.tsx into the dedicated #maze-root portal.
function MazeRouteShell() {
  return null;
}

const PAGE_COMPONENTS = {
  home: HomePage,
  maze: MazeRouteShell,
  'maze-hub': MazeHubPage,
  explore: ExplorePage,
  profile: ProfilePage,
};

/** One React router dispatches all active site features without touching API routes. */
export function AppRouter() {
  const pathname = usePathname();
  const route = resolveSiteRoute(pathname);

  const Page = route
    ? PAGE_COMPONENTS[route.page as keyof typeof PAGE_COMPONENTS]
    : undefined;

  if (!route || !Page) {
    return <NotFoundPage />;
  }

  const isHomePage = route.id === 'home';
  const isMazeHubPage = route.id === 'maze-hub';

  return (
    <>
      {/* Persistent site navigation */}
      <SiteChromeHosts
        mazePage={route.id === 'maze'}
      />

      <Suspense fallback={null}>
        <>
          {/* Active route content */}
          <div
            className={`route-page${isHomePage ? ' route-page--home' : ''}${isMazeHubPage ? ' route-page--maze-hub' : ''}`}
            key={pathname}
            data-route-page={pathname}
          >
            <Page />
          </div>

        </>
      </Suspense>
    </>
  );
}