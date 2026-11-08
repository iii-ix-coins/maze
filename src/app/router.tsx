import { HomePage } from '../features/home/HomePage';
import { CoinPage } from '../features/coin/CoinPage';
import { HoldersPage } from '../features/holders/HoldersPage';
import { MarketPage } from '../features/market/MarketPage';
import { NotFoundPage } from '../components/layout/NotFoundPage';
import { SiteChromeHosts } from '../components/layout/SiteChromeHosts';

/** One React router dispatches all active site features without touching API routes. */
export function AppRouter() {
  const pathname = window.location.pathname.toLowerCase().replace(/\/+$/, '') || '/';

  if (pathname === '/' || pathname === '/index.html' || pathname === '/maze.html') {
    return <HomePage />;
  }
  if (pathname === '/coin.html' || pathname === '/token') {
    return <><SiteChromeHosts /><CoinPage /></>;
  }
  if (pathname === '/holders.html' || pathname === '/holders') {
    return <><SiteChromeHosts /><HoldersPage /></>;
  }
  if (pathname === '/market.html' || pathname === '/market') {
    return <><SiteChromeHosts /><MarketPage /></>;
  }

  return <NotFoundPage />;
}
