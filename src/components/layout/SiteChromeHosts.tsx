import { useEffect } from 'react';
import { getSiteRoutePath } from '../../app/routes';
import { SiteNavigation } from '../navigation/SiteNavigation';
import { ThemedSvgIcon } from '../media/ThemedSvgIcon';
import { ThemeSwitcher } from '../navigation/ThemeSwitcher';
import { HeaderCoinBalance } from './HeaderCoinBalance';

/** Persistent chrome: a shared topbar frame and the bottom navigation dock. */
export function SiteChromeHosts({ mazePage = false }: { mazePage?: boolean }) {
  useEffect(() => {
    const markChromeEntered = (event: Event) => {
      const animationEvent = event as AnimationEvent;
      if (animationEvent.animationName !== 'maze-unified-enter') return;

      const target = animationEvent.target;
      if (!(target instanceof HTMLElement)) return;

      const enteredClass = target.id === 'site-header'
        ? 'maze-header-entered'
        : target.id === 'site-topbar'
          ? 'maze-site-brand-entered'
          : target.id === 'site-brand-header'
            ? 'maze-brand-entered'
            : undefined;

      if (enteredClass) document.body.classList.add(enteredClass);
    };

    document.addEventListener('animationend', markChromeEntered);
    return () => document.removeEventListener('animationend', markChromeEntered);
  }, []);

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


      <div id="site-header" data-maze-page={mazePage ? 'true' : undefined}>
        <SiteNavigation />
      </div>
    </>
  );
}
