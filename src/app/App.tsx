import { useEffect } from 'react';
import { AppProviders } from './providers/AppProviders';
import { AppRouter } from './router';
import { AppErrorBoundary } from './error-boundary';
import { initNavigation, usePathname } from './navigation';
import { resolveSiteRoute, SITE_DEFAULT_TITLE } from './routes';
import { PageLoadingProvider } from '../components/layout/PageLoadingProvider';
import { SiteChromeHosts } from '../components/layout/SiteChromeHosts';
import { useIdentity } from '../platform/identity/IdentityProvider';

/** One React tree owns the persistent background, site shell, routes and page loader. */
export function App() {
  return (
    <AppErrorBoundary>
      <AppProviders>
        <AppContent />
      </AppProviders>
    </AppErrorBoundary>
  );
}

function AppContent() {
  const pathname = usePathname();
  const route = resolveSiteRoute(pathname);
  const { status } = useIdentity();
  const isMazePage = route?.id === 'maze';

  useEffect(() => initNavigation(), []);
  useEffect(() => {
    document.title = route?.title ?? SITE_DEFAULT_TITLE;
  }, [route?.title]);

  return (
    <PageLoadingProvider waitForMazeEngine={isMazePage} identityStatus={status}>
      <SiteChromeHosts />
      <AppRouter />
    </PageLoadingProvider>
  );
}
