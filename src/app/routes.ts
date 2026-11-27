import siteRouteManifest from '../../shared/site-routes.json';

export const SITE_ROUTES = siteRouteManifest.routes;
const homeRoute = SITE_ROUTES.find((route) => route.id === 'home');
if (!homeRoute?.title) throw new Error('The shared site route manifest must define the home page title.');
export const SITE_DEFAULT_TITLE = homeRoute.title;

export type SiteRoute = (typeof SITE_ROUTES)[number];

export function normalizePath(pathname: string): string {
  const path = pathname.toLowerCase().replace(/\/+$/, '') || '/';
  return path === '/index.html' ? '/' : path;
}

export function resolveSiteRoute(pathname: string): SiteRoute | undefined {
  const normalized = normalizePath(pathname);
  return SITE_ROUTES.find((route) => route.paths.includes(normalized));
}

export const CLIENT_ROUTE_PATHS = new Set(
  SITE_ROUTES.flatMap((route) => route.paths),
);

export const SOFT_NAVIGATION_PATHS = new Set(
  SITE_ROUTES.filter((route) => route.soft).flatMap((route) => route.paths),
);

/** A client-side transition is valid only when both ends belong to the SPA route set. */
export function isSoftNavigationPath(pathname: string): boolean {
  return SOFT_NAVIGATION_PATHS.has(normalizePath(pathname));
}

export function canSoftNavigateBetween(fromPath: string, toPath: string): boolean {
  return isSoftNavigationPath(fromPath) && isSoftNavigationPath(toPath);
}

export function getSiteRoutePath(routeId: string): string {
  const path = SITE_ROUTES.find((route) => route.id === routeId)?.paths[0];
  if (!path) throw new Error(`Unknown site route: ${routeId}`);
  return path;
}

export function getSiteRoutePathByNavKey(navKey: string): string {
  const path = SITE_ROUTES.find((route) => route.navKey === navKey)?.paths[0];
  if (!path) throw new Error(`No site route is registered for navigation key: ${navKey}`);
  return path;
}
