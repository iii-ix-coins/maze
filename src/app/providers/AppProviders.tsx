import type { ReactNode } from 'react';
import { ThemeBridgeProvider } from './ThemeBridgeProvider';
import { IdentityProvider } from '../../platform/identity/IdentityProvider';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeBridgeProvider>
      <IdentityProvider>{children}</IdentityProvider>
    </ThemeBridgeProvider>
  );
}
