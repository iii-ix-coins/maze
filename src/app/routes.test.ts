import { describe, expect, it } from 'vitest';
import {
  CLIENT_ROUTE_PATHS,
  SITE_ROUTES,
  SOFT_NAVIGATION_PATHS,
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
    expect(resolveSiteRoute('/explore')?.navKey).toBe('explore');
    expect(SOFT_NAVIGATION_PATHS.has('/explore')).toBe(true);
    expect(getSiteRoutePathByNavKey('explore')).toBe('/explore');
    expect(resolveSiteRoute('/coin.html')).toBeUndefined();
    expect(resolveSiteRoute('/token')).toBeUndefined();
    expect(resolveSiteRoute('/holders.html')?.id).toBe('holders');
    expect(resolveSiteRoute('/holders')?.id).toBe('holders');
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
    expect(SOFT_NAVIGATION_PATHS.has('/maze.html')).toBe(false);
    expect(SOFT_NAVIGATION_PATHS.has('/profile')).toBe(true);
  });

  it('normalizes slash and index aliases consistently', () => {
    expect(normalizePath('/index.html')).toBe('/');
    expect(normalizePath('/profile/')).toBe('/profile');
  });
});
