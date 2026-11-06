import { useEffect } from 'react';
import { SiteChromeHosts } from '../../components/layout/SiteChromeHosts';
import { bootLegacyHomeScripts } from './legacy-home-runtime';

/** React route for the current Home page; legacy feature behavior stays compatible. */
export function LegacyHomePage() {
  useEffect(() => {
    void bootLegacyHomeScripts().catch((error: unknown) => {
      console.error('[Site] Compatibility bootstrap failed:', error);
      document.body.dataset.legacyBootstrapError = 'true';
    });
  }, []);

  return <SiteChromeHosts />;
}
