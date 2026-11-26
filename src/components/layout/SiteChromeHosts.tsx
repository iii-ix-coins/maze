import { memo } from 'react';
import { getSiteRoutePath } from '../../app/routes';
import { SiteNavigation } from '../navigation/SiteNavigation';
import { ThemedSvgIcon } from '../media/ThemedSvgIcon';
import { ThemeSwitcher } from '../navigation/ThemeSwitcher';
import { HeaderCoinBalance } from './HeaderCoinBalance';

/**
 * Persistent site chrome is mounted above AppRouter and memoized.
 * Route changes replace only the content frame; the header and dock stay mounted.
 */
export const SiteChromeHosts = memo(function SiteChromeHosts() {
  return (
    <>
      <header id="site-topbar" className="site-topbar" aria-label="Maze site header">
        <a id="site-brand" className="site-brand" href={getSiteRoutePath('home')} aria-label="Maze home">
          <span className="nav-brand-mark" aria-hidden="true">
            <ThemedSvgIcon className="nav-brand-logo" src="/css/images/maze-logo.svg" />
          </span>
        </a>
        <div className="site-topbar-theme-slot" aria-label="Theme selection">
          <ThemeSwitcher />
        </div>
        <HeaderCoinBalance />
      </header>

      <div id="site-header">
        <SiteNavigation />
      </div>
    </>
  );
});
