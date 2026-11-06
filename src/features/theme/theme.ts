export const SITE_THEMES = ['grass', 'dark', 'light'] as const;

export type SiteTheme = (typeof SITE_THEMES)[number];

export function normalizeSiteTheme(value: string | null | undefined): SiteTheme {
  return SITE_THEMES.includes(value as SiteTheme) ? (value as SiteTheme) : 'grass';
}
