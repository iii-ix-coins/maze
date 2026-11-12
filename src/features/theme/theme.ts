export const SITE_THEMES = ['grass', 'dark', 'light'] as const;

export type SiteTheme = (typeof SITE_THEMES)[number];

const THEME_STORAGE_KEYS = ['maze-theme', 'hollld-theme'] as const;

export function normalizeSiteTheme(value: string | null | undefined): SiteTheme {
  return SITE_THEMES.includes(value as SiteTheme) ? (value as SiteTheme) : 'grass';
}

/**
 * The theme remains a document-level preference because the existing CSS,
 * background renderer and Maze engine all consume html[data-theme]. React is
 * the only UI writer; both historical storage keys remain synchronized.
 */
export function applySiteTheme(theme: string, persist = true): SiteTheme {
  const selectedTheme = normalizeSiteTheme(theme);
  const updateDocument = () => {
    document.documentElement.dataset.theme = selectedTheme;
    window.dispatchEvent(new CustomEvent('site:themechange', { detail: { theme: selectedTheme } }));
  };
  const startTransition = (document as Document & { startViewTransition?: (callback: () => void) => unknown }).startViewTransition;
  if (typeof startTransition === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    startTransition.call(document, updateDocument);
  } else {
    updateDocument();
  }

  if (persist) {
    try {
      for (const key of THEME_STORAGE_KEYS) {
        window.localStorage.setItem(key, selectedTheme);
      }
    } catch {
      // The current page can still change theme when storage is unavailable.
    }
  }


  return selectedTheme;
}
