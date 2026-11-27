import { lazy, Suspense, useEffect, useState } from 'react';

import { NotFoundPage } from '../components/layout/NotFoundPage';
import { RouteScrollbar } from '../components/layout/RouteScrollbar';
import { PageAccessGate, type AccessPage } from '../components/access/PageAccessGate';
import { useIdentity } from '../platform/identity/IdentityProvider';
import { MazeFrame } from '../features/maze/MazeFrame';

import { usePathname } from './navigation';
import { loadExplorePage, loadHomePage, loadMazeHubPage, loadMazePage, loadProfilePage } from './route-loaders';
import { resolveSiteRoute } from './routes';

const HomePage = lazy(loadHomePage);
const ExplorePage = lazy(loadExplorePage);
const MazeHubPage = lazy(loadMazeHubPage);
const ProfilePage = lazy(loadProfilePage);
const MazePage = lazy(loadMazePage);

const PAGE_COMPONENTS = {
  home: HomePage,
  'maze-hub': MazeHubPage,
  explore: ExplorePage,
  profile: ProfilePage,
};

/** Every route writes into the same content surface and the same scroll owner. */
const ACCESS_PAGE_BY_ROUTE: Record<string, AccessPage> = {
  home: 'home',
  explore: 'explore',
  'maze-hub': 'maze-hub',
  profile: 'profile',
};

function getRequestedMazeAccessPage(): AccessPage {
  const view = new URLSearchParams(window.location.search).get('view');
  if (view === 'rooms') return 'rooms';
  if (view === 'live') return 'live';
  if (view === 'waiting') return 'waiting-room';
  return 'create';
}

export function AppRouter() {
  const pathname = usePathname();
  const { status, isAuthenticated, error, refreshSession } = useIdentity();
  const route = resolveSiteRoute(pathname);
  const isMazePage = route?.id === 'maze';
  const [hasMountedMaze, setHasMountedMaze] = useState(isMazePage && isAuthenticated);

  // Keep the Engine's DOM contract mounted after first authenticated activation.
  // It is parked inside the shared scroll surface on every other route.
  useEffect(() => {
    if (isMazePage && isAuthenticated) setHasMountedMaze(true);
  }, [isMazePage, isAuthenticated]);

  const Page = route && !isMazePage
    ? PAGE_COMPONENTS[route.page as keyof typeof PAGE_COMPONENTS]
    : undefined;

  return (
    <div
      className="route-page"
      data-route-page={pathname}
      data-route-kind={isMazePage ? 'maze' : 'site'}
      onAnimationEnd={(event) => {
        const animatedSurface = event.target;
        if (
          event.animationName === 'site-route-content-enter' &&
          animatedSurface instanceof HTMLElement &&
          animatedSurface.matches('.route-page > .feature-page-shell > .route-view:not([hidden])')
        ) {
          delete document.documentElement.dataset.siteRouteFallback;
        }
      }}
    >
      <main className="feature-page-shell" aria-label={route ? `${route.title} content` : 'Not found page'}>
        {!route ? (
          <NotFoundPage />
        ) : !isAuthenticated ? (
          <section className="route-view route-view--access">
            <PageAccessGate
              page={isMazePage ? getRequestedMazeAccessPage() : ACCESS_PAGE_BY_ROUTE[route.id] ?? 'home'}
              status={status}
              error={error}
              onRetry={refreshSession}
            />
          </section>
        ) : !isMazePage ? (
          <Suspense fallback={null}>
            {Page ? <Page key={pathname} /> : <NotFoundPage />}
          </Suspense>
        ) : null}

        <MazeFrame active={isMazePage && isAuthenticated}>
          <Suspense fallback={null}>
            {hasMountedMaze ? (
              <MazePage active={isMazePage && isAuthenticated} authenticated={isAuthenticated} />
            ) : null}
          </Suspense>
        </MazeFrame>
      </main>

      <RouteScrollbar contentSelector=":scope > .feature-page-shell" />
    </div>
  );
}
