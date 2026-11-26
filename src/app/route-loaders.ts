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

export function loadProfilePage() {
  return import('../features/profile/ProfilePage').then((module) => {
    loadedRoutePages.add('profile');
    return { default: module.ProfilePage };
  });
}
