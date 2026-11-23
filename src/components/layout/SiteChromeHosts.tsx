import { useEffect } from 'react';
import { getSiteRoutePath } from '../../app/routes';
import { SiteNavigation } from '../navigation/SiteNavigation';

/** Persistent chrome: brand stays independent; notifications, theme and routes live in the bottom dock. */
export function SiteChromeHosts({ mazePage = false }: { mazePage?: boolean }) {
  useEffect(() => {
    const markChromeEntered = (event: Event) => {
      const animationEvent = event as AnimationEvent;
      if (animationEvent.animationName !== 'maze-unified-enter') return;

      const target = animationEvent.target;
      if (!(target instanceof HTMLElement)) return;

      const enteredClass = target.id === 'site-header'
        ? 'maze-header-entered'
        : target.id === 'site-brand'
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
      <a id="site-brand" className="site-brand" href={getSiteRoutePath('home')} aria-label="Maze home">
        <span className="nav-brand-mark" aria-hidden="true">
          <img className="nav-brand-logo nav-brand-logo--white" src="/css/images/maze-logo-white.svg" alt="" decoding="async" />
          <img className="nav-brand-logo nav-brand-logo--black" src="/css/images/maze-logo-black.svg" alt="" decoding="async" />
          <img className="nav-brand-logo nav-brand-logo--green" src="/css/images/maze-logo-green.svg" alt="" decoding="async" />
        </span>
      </a>


      <div id="site-header" data-maze-page={mazePage ? 'true' : undefined}>
        <SiteNavigation />
      </div>
    </>
  );
}
