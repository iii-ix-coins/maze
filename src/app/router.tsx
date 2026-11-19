import { lazy, Suspense } from 'react';

import { NotFoundPage } from '../components/layout/NotFoundPage';
import { SiteChromeHosts } from '../components/layout/SiteChromeHosts';
import { HomeHeroSlider } from '../components/home/HomeHeroSlider';

import { usePathname } from './navigation';
import { resolveSiteRoute } from './routes';

const HomePage = lazy(() =>
  import('../features/home/HomePage').then((module) => ({
    default: module.HomePage
  }))
);

const CoinPage = lazy(() =>
  import('../features/coin/CoinPage').then((module) => ({
    default: module.CoinPage
  }))
);

const HoldersPage = lazy(() =>
  import('../features/holders/HoldersPage').then((module) => ({
    default: module.HoldersPage
  }))
);

const MarketPage = lazy(() =>
  import('../features/market/MarketPage').then((module) => ({
    default: module.MarketPage
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
  coin: CoinPage,
  holders: HoldersPage,
  market: MarketPage,
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

  return (
    <>
      {/* Persistent site navigation and interaction dock */}
      <SiteChromeHosts
        mazePage={route.id === 'maze'}
      />

      <Suspense fallback={null}>
        <>
          {/* Active route content */}
          <div
            className={`route-page${isHomePage ? ' route-page--home' : ''}`}
            key={pathname}
            data-route-page={pathname}
          >
            <Page />
          </div>

          {/* Home Hero appears after Market Summary, only on Home */}
          {isHomePage && (
            <div
              id="site-brand-header"
              className="site-brand-header-host"
            >
              <HomeHeroSlider />
            </div>
          )}
        </>
      </Suspense>
    </>
  );
}