import '../../styles/home-style.css';
import { MarketSummary } from '../market/MarketSummary';
import { LiveFeedPanel } from '../live-feed/LiveFeedPanel';
import { HoldersPanel } from '../holders/HoldersPanel';

/** Home content only; the shared site chrome is owned by the router. */
export function HomePage() {
  return (
    <main className="site-home-content feature-page-shell">
      <MarketSummary />
      <LiveFeedPanel />
      <HoldersPanel />
    </main>
  );
}