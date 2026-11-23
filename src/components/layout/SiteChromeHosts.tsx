import { useEffect } from 'react';
import { SiteNavigation } from '../navigation/SiteNavigation';

/**
 * Persistent site chrome.
 * HomeHeroSlider is mounted by AppRouter after HomePage content.
 * The site navigation is the only persistent site chrome host.
 */
export function SiteChromeHosts({
  mazePage = false
}: {
  mazePage?: boolean;
}) {
  useEffect(() => {
    const markChromeEntered = (event: Event) => {
      const animationEvent = event as AnimationEvent;
      if (animationEvent.animationName !== 'maze-unified-enter') return;

      const target = animationEvent.target;
      if (!(target instanceof HTMLElement)) return;

      let enteredClass: string | undefined;

      switch (target.id) {
        case 'site-header':
          enteredClass = 'maze-header-entered';
          break;

        case 'site-brand-header':
          enteredClass = 'maze-brand-entered';
          break;
      }

      if (enteredClass) {
        document.body.classList.add(enteredClass);
      }
    };

    document.addEventListener('animationend', markChromeEntered);

    return () => {
      document.removeEventListener('animationend', markChromeEntered);
    };
  }, []);

  return (
    <>
      <div id="site-header" data-maze-page={mazePage ? 'true' : undefined}>
        <SiteNavigation />
      </div>
    </>
  );
}