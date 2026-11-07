import { describe, expect, it } from 'vitest';
import { normalizeSiteTheme } from './theme';

describe('normalizeSiteTheme', () => {
  it.each(['grass', 'dark', 'light'] as const)('preserves %s', (theme) => {
    expect(normalizeSiteTheme(theme)).toBe(theme);
  });

  it.each([null, undefined, '', 'unknown', 'LIGHT'])('falls back to grass for %s', (value) => {
    expect(normalizeSiteTheme(value)).toBe('grass');
  });
});
