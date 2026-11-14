import { useEffect } from 'react';
import { SiteNavigation } from '../navigation/SiteNavigation';
import { InteractionBar } from '../../features/interaction/InteractionBar';
import { HomeHeroSlider } from '../home/HomeHeroSlider';

/**
 * React owns the original four body-level site regions. IDs, order and styling
 * hooks are retained so the existing CSS and Maze page continue to line up.
 */
export function SiteChromeHosts({
  mazePage = false,
  homePage = false
}: {
  mazePage?: boolean;
  homePage?: boolean;
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

      if (enteredClass) document.body.classList.add(enteredClass);
    };

    document.addEventListener('animationend', markChromeEntered);
    return () => document.removeEventListener('animationend', markChromeEntered);
  }, []);

  return (
    <>
      <div id="site-header"><SiteNavigation /></div>
      {homePage && (
        <div id="site-brand-header" className="site-brand-header-host">
          <HomeHeroSlider />
        </div>
      )}

      {!mazePage && <InteractionBar />}
    </>
  );
}
