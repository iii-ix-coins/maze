import { SiteChromeHosts } from '../../components/layout/SiteChromeHosts';
import { MarketSummary } from '../market/MarketSummary';
import { LiveFeedPanel } from '../live-feed/LiveFeedPanel';
import { HoldersPanel } from '../holders/HoldersPanel';

/** React-owned home page. Existing API-backed sections are rendered by feature components. */
export function HomePage() {
  const isMazeRoute = window.location.pathname === '/maze.html';
  return (
    <>
      <SiteChromeHosts mazePage={isMazeRoute} />
      {!isMazeRoute ? (
        <main className="site-home-content feature-page-shell">
          <MarketSummary />
          <LiveFeedPanel />
          <HoldersPanel />
        </main>
      ) : null}
    </>
  );
}
