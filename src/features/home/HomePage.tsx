import '../../styles/home-style.css';
import { MarketSummary } from '../market/MarketSummary';
export function HomePage() {
  return (
    <main className="site-home-content feature-page-shell">
      <MarketSummary showTitle={false} />
    </main>
  );
}