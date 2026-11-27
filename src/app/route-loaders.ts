/**
 * Centralized lazy page loaders. Tracking the resolved route chunks lets
 * navigation choose a native View Transition only when React can paint the
 * destination in the transition update (rather than capturing an empty
 * Suspense frame on a page's first visit).
 */
const loadedRoutePages = new Set<string>();

export function isRoutePageLoaded(page: string): boolean {
  return loadedRoutePages.has(page);
}

export function loadHomePage() {
  return import('../features/home/HomePage').then((module) => {
    loadedRoutePages.add('home');
    return { default: module.HomePage };
  });
}

export function loadExplorePage() {
  return import('../features/explore/ExplorePage').then((module) => {
    loadedRoutePages.add('explore');
    return { default: module.ExplorePage };
  });
}

export function loadMazeHubPage() {
  return import('../features/maze/MazeHubPage').then((module) => {
    loadedRoutePages.add('maze-hub');
    return { default: module.MazeHubPage };
  });
}

export function loadMazePage() {
  return import('../features/maze/MazePage').then((module) => {
    loadedRoutePages.add('maze');
    return { default: module.MazePage };
  });
}

export function loadProfilePage() {
  return import('../features/profile/ProfilePage').then((module) => {
    loadedRoutePages.add('profile');
    return { default: module.ProfilePage };
  });
}

/**
 * Preload the requested Site route after the visitor explicitly begins sign-in.
 * This does not mount the page or run its effects; it prevents a verified login
 * from switching to an empty Suspense frame while the destination chunk downloads.
 */
export async function preloadSiteRoutePage(pathname: string): Promise<void> {
  const { resolveSiteRoute } = await import('./routes');
  const route = resolveSiteRoute(pathname);
  switch (route?.page) {
    case 'home': await loadHomePage(); break;
    case 'explore': await loadExplorePage(); break;
    case 'maze-hub': await loadMazeHubPage(); break;
    case 'maze': await loadMazePage(); break;
    case 'profile': await loadProfilePage(); break;
    default: break;
  }
}
