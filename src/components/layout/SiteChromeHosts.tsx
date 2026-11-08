import { useEffect } from 'react';
import { SiteNavigation } from '../navigation/SiteNavigation';
import { InteractionBar } from '../../features/interaction/InteractionBar';
import { MazeBackground } from '../../features/theme/MazeBackground';

/**
 * React owns the original four body-level site regions. IDs, order and styling
 * hooks are retained so the existing CSS and Maze page continue to line up.
 */
export function SiteChromeHosts({ mazePage = false }: { mazePage?: boolean }) {
  useEffect(() => {
    const markPageLoaded = () => {
      document.body.classList.remove('page-loading');
      document.body.classList.add('page-loaded');
    };
    if (document.readyState === 'complete') markPageLoaded();
    else window.addEventListener('load', markPageLoaded, { once: true });
    return () => window.removeEventListener('load', markPageLoaded);
  }, []);

  return (
    <>
      <MazeBackground />
      <div id="site-header"><SiteNavigation /></div>
      {!mazePage && (
        <>
          <div id="site-brand-header" className="site-brand-header-host">
            <div id="hold-info" className="brand-header">
              <p className="brand-description">
                Start Maze Mining<br />
                <span>Create or join maze mining rooms</span>
              </p>
            </div>
          </div>
          <InteractionBar />
        </>
      )}
    </>
  );
}
