import { SiteNavigation } from '../navigation/SiteNavigation';
import { InteractionBar } from '../../features/interaction/InteractionBar';

/**
 * React owns the original four body-level site regions. IDs, order and styling
 * hooks are retained so the existing CSS and Maze page continue to line up.
 */
export function SiteChromeHosts() {
  return (
    <>
      <div id="site-header"><SiteNavigation /></div>
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
  );
}
