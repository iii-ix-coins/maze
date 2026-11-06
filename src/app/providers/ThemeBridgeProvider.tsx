import { createContext, useEffect, useState, type ReactNode } from 'react';
import { normalizeSiteTheme, type SiteTheme } from '../../features/theme/theme';

export const ThemeBridgeContext = createContext<SiteTheme>('grass');

/**
 * Read-only bridge to the existing theme controller. The legacy ThemeSwitcher
 * remains the sole writer of localStorage and documentElement.dataset.theme.
 */
export function ThemeBridgeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<SiteTheme>(() =>
    normalizeSiteTheme(document.documentElement.dataset.theme),
  );

  useEffect(() => {
    const syncTheme = () => {
      setTheme(normalizeSiteTheme(document.documentElement.dataset.theme));
    };

    window.addEventListener('site:themechange', syncTheme);
    window.addEventListener('storage', syncTheme);
    syncTheme();

    return () => {
      window.removeEventListener('site:themechange', syncTheme);
      window.removeEventListener('storage', syncTheme);
    };
  }, []);

  return <ThemeBridgeContext.Provider value={theme}>{children}</ThemeBridgeContext.Provider>;
}
