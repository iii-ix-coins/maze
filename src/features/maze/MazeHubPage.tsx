import '../../styles/home-style.css';
import './maze-hub.css';
import { HomeHeroSlider } from '../../components/home/HomeHeroSlider';
import { MarketSummary } from '../market/MarketSummary';

/** The former Home landing content lives here; the root Home route is now the game feed. */
export function MazeHubPage() {
  return (
    <section className="route-view maze-hub-page" aria-label="Maze Hub">
      <header className="feature-page-title maze-hub-title">
        <span className="eyebrow">PLAY · CREATE · COMPETE</span>
        <h1>Maze Hub</h1>
        <p>Your starting point for creating a race, exploring the game and checking the Maze market.</p>
      </header>
      <section className="maze-hub-market" aria-label="Maze market summary">
        <MarketSummary showTitle={false} compact />
      </section>
      <div id="site-brand-header" className="site-brand-header-host maze-hub-hero-host">
        <HomeHeroSlider />
      </div>
    </section>
  );
}
