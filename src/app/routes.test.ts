import { describe, expect, it } from 'vitest';
import {
  CLIENT_ROUTE_PATHS,
  SITE_ROUTES,
  SOFT_NAVIGATION_PATHS,
  canSoftNavigateBetween,
  normalizePath,
  resolveSiteRoute,
  getSiteRoutePathByNavKey,
} from './routes';

describe('shared site route manifest', () => {
  it('defines every client path exactly once', () => {
    const paths = SITE_ROUTES.flatMap((route) => route.paths);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.every((path) => path.startsWith('/'))).toBe(true);
  });

  it('resolves aliases to the same page definition', () => {
    expect(resolveSiteRoute('/explore')?.id).toBe('explore');
    expect(resolveSiteRoute('/maze')?.id).toBe('maze-hub');
    expect(resolveSiteRoute('/maze')?.navKey).toBe('maze-hub');
    expect(SOFT_NAVIGATION_PATHS.has('/maze')).toBe(true);
    expect(getSiteRoutePathByNavKey('maze-hub')).toBe('/maze');
    expect(resolveSiteRoute('/explore')?.navKey).toBe('explore');
    expect(SOFT_NAVIGATION_PATHS.has('/explore')).toBe(true);
    expect(getSiteRoutePathByNavKey('explore')).toBe('/explore');
    expect(resolveSiteRoute('/coin.html')).toBeUndefined();
    expect(resolveSiteRoute('/token')).toBeUndefined();
    expect(resolveSiteRoute('/holders.html')).toBeUndefined();
    expect(resolveSiteRoute('/holders')).toBeUndefined();
    expect(CLIENT_ROUTE_PATHS.has('/holders')).toBe(false);
    expect(resolveSiteRoute('/market.html')).toBeUndefined();
    expect(resolveSiteRoute('/market')).toBeUndefined();
    expect(resolveSiteRoute('/profile')?.navKey).toBe('profile');
    expect(getSiteRoutePathByNavKey('profile')).toBe('/profile');
  });

  it('registers Maze as a soft route in the shared SPA document', () => {
    expect(CLIENT_ROUTE_PATHS.has('/maze.html')).toBe(true);
    expect(CLIENT_ROUTE_PATHS.has('/play')).toBe(true);
    expect(resolveSiteRoute('/play')?.id).toBe('maze');
    expect(SOFT_NAVIGATION_PATHS.has('/maze.html')).toBe(true);
    expect(SOFT_NAVIGATION_PATHS.has('/profile')).toBe(true);
  });

  it('allows all registered site routes to share same-document transitions', () => {
    expect(canSoftNavigateBetween('/', '/profile')).toBe(true);
    expect(canSoftNavigateBetween('/maze.html', '/')).toBe(true);
    expect(canSoftNavigateBetween('/play', '/explore')).toBe(true);
    expect(canSoftNavigateBetween('/profile', '/maze.html')).toBe(true);
    expect(canSoftNavigateBetween('/maze', '/profile')).toBe(true);
  });

  it('normalizes slash and index aliases consistently', () => {
    expect(normalizePath('/index.html')).toBe('/');
    expect(normalizePath('/profile/')).toBe('/profile');
  });
});
