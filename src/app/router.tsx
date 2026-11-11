import type { ReactNode } from 'react';
import { HomePage } from '../features/home/HomePage';
import { CoinPage } from '../features/coin/CoinPage';
import { HoldersPage } from '../features/holders/HoldersPage';
import { MarketPage } from '../features/market/MarketPage';
import { NotFoundPage } from '../components/layout/NotFoundPage';
import { SiteChromeHosts } from '../components/layout/SiteChromeHosts';
import { usePathname } from './navigation';

/** One React router dispatches all active site features without touching API routes. */
export function AppRouter() {
  const pathname = usePathname();

  let page: ReactNode;
  if (pathname === '/' || pathname === '/maze.html') page = <HomePage />;
  else if (pathname === '/coin.html' || pathname === '/token') page = <CoinPage />;
  else if (pathname === '/holders.html' || pathname === '/holders') page = <HoldersPage />;
  else if (pathname === '/market.html' || pathname === '/market') page = <MarketPage />;
  else return <NotFoundPage />;

  return (
    <>
      <SiteChromeHosts mazePage={pathname === '/maze.html'} />
      {page}
    </>
  );
}