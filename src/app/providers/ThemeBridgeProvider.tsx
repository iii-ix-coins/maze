import { createContext, useEffect, useState, type ReactNode } from 'react';
import { normalizeSiteTheme, type SiteTheme } from '../../features/theme/theme';

export const ThemeBridgeContext = createContext<SiteTheme>('grass');

/** Mirrors the canonical document theme into React without creating a second source of truth. */
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
