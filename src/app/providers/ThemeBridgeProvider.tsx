import { createContext, useEffect, useState, type ReactNode } from 'react';
import { applySiteTheme, normalizeSiteTheme, type SiteTheme } from '../../features/theme/theme';

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

    const onStorage = (event: StorageEvent) => {
      if ((event.key === 'hollld-theme' || event.key === 'maze-theme') && event.newValue) {
        applySiteTheme(event.newValue, false);
      } else {
        syncTheme();
      }
    };
    window.addEventListener('site:themechange', syncTheme);
    window.addEventListener('storage', onStorage);
    syncTheme();

    return () => {
      window.removeEventListener('site:themechange', syncTheme);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return <ThemeBridgeContext.Provider value={theme}>{children}</ThemeBridgeContext.Provider>;
}
