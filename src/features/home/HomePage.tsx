import { useEffect } from 'react';
import { SiteChromeHosts } from '../../components/layout/SiteChromeHosts';

/** Native React Home shell. The platform APIs and all public URLs remain unchanged. */
export function HomePage() {
  useEffect(() => {
    const markPageLoaded = () => {
      document.body.classList.remove('page-loading');
      document.body.classList.add('page-loaded');
    };

    if (document.readyState === 'complete') markPageLoaded();
    else window.addEventListener('load', markPageLoaded, { once: true });

    return () => window.removeEventListener('load', markPageLoaded);
  }, []);

  return <SiteChromeHosts />;
}
