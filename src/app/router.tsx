import { lazy, Suspense, type ReactNode } from 'react';
import { NotFoundPage } from '../components/layout/NotFoundPage';
import { SiteChromeHosts } from '../components/layout/SiteChromeHosts';
import { usePathname } from './navigation';

const HomePage = lazy(() => import('../features/home/HomePage').then((module) => ({ default: module.HomePage })));
const CoinPage = lazy(() => import('../features/coin/CoinPage').then((module) => ({ default: module.CoinPage })));
const HoldersPage = lazy(() => import('../features/holders/HoldersPage').then((module) => ({ default: module.HoldersPage })));
const MarketPage = lazy(() => import('../features/market/MarketPage').then((module) => ({ default: module.MarketPage })));

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
      <Suspense fallback={null}>
        {page}
      </Suspense>
    </>
  );
}