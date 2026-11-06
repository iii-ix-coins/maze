import type { ReactNode } from 'react';
import { ThemeBridgeProvider } from './ThemeBridgeProvider';

export function AppProviders({ children }: { children: ReactNode }) {
  return <ThemeBridgeProvider>{children}</ThemeBridgeProvider>;
}
