import { describe, expect, it } from 'vitest';
import {
  CLIENT_ROUTE_PATHS,
  SITE_ROUTES,
  SOFT_NAVIGATION_PATHS,
  canSoftNavigateBetween,
  isMazeDocumentPath,
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

  it('keeps maze navigation as a document navigation, not a soft navigation', () => {
    expect(CLIENT_ROUTE_PATHS.has('/maze.html')).toBe(true);
    expect(CLIENT_ROUTE_PATHS.has('/play')).toBe(true);
    expect(resolveSiteRoute('/play')?.id).toBe('maze');
    expect(isMazeDocumentPath('/play')).toBe(true);
    expect(isMazeDocumentPath('/market')).toBe(false);
    expect(isMazeDocumentPath('/maze')).toBe(false);
    expect(SOFT_NAVIGATION_PATHS.has('/maze.html')).toBe(false);
    expect(SOFT_NAVIGATION_PATHS.has('/profile')).toBe(true);
  });

  it('keeps the standalone Maze document outside SPA transitions in both directions', () => {
    expect(canSoftNavigateBetween('/', '/profile')).toBe(true);
    expect(canSoftNavigateBetween('/maze.html', '/')).toBe(false);
    expect(canSoftNavigateBetween('/play', '/explore')).toBe(false);
    expect(canSoftNavigateBetween('/profile', '/maze.html')).toBe(false);
    expect(canSoftNavigateBetween('/maze', '/profile')).toBe(true);
  });

  it('normalizes slash and index aliases consistently', () => {
    expect(normalizePath('/index.html')).toBe('/');
    expect(normalizePath('/profile/')).toBe('/profile');
  });
});
