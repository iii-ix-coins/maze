import { useEffect } from 'react';
import { SiteNavigation } from '../navigation/SiteNavigation';
import { InteractionBar } from '../../features/interaction/InteractionBar';

/**
 * Persistent site chrome.
 * HomeHeroSlider is mounted by AppRouter after HomePage content.
 * Existing IDs and animation hooks are preserved.
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

        case 'site-interaction-bar':
          enteredClass = 'maze-interaction-entered';
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
      <div id="site-header">
        <SiteNavigation />
      </div>

      {!mazePage && <InteractionBar />}
    </>
  );
}