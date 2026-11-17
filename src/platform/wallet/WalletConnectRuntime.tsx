import { useEffect, useRef } from 'react';
import { useAppKit, useAppKitAccount } from '@reown/appkit/react';
import { useSiteTheme } from '../../hooks/useSiteTheme';
import { applyWalletTheme } from './appkit'; // importing also runs createAppKit()

export type WalletOpenOptions = Parameters<ReturnType<typeof useAppKit>['open']>[0];
export type WalletOpenFn = (options?: WalletOpenOptions) => unknown;

export type WalletSnapshot = {
  address: string | undefined;
  isConnected: boolean;
  status: string | undefined;
};

export type WalletRuntimeProps = {
  /** Latest Solana account state, pushed to the persistent nav button. */
  onSnapshot: (snapshot: WalletSnapshot) => void;
  /** Hands the stable `open` function to the button (null on unmount). */
  onReady: (open: WalletOpenFn | null) => void;
};

/**
 * Headless bridge between AppKit hooks and the nav button. It renders nothing:
 * the visible button lives in WalletConnectButton so it is never replaced
 * (no lost focus, no "first click only loads the runtime").
 */
export function WalletRuntime({ onSnapshot, onReady }: WalletRuntimeProps) {
  const { open } = useAppKit();
  const { address, isConnected, status } = useAppKitAccount({ namespace: 'solana' });
  const theme = useSiteTheme();

  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  });

  useEffect(() => {
    onReady((options) => openRef.current(options));
    return () => onReady(null);
  }, [onReady]);

  useEffect(() => {
    onSnapshot({ address, isConnected, status });
  }, [address, isConnected, status, onSnapshot]);

  // Only the site theme drives this; no AppKit hook is subscribed to what it writes.
  useEffect(() => {
    applyWalletTheme(theme);
  }, [theme]);

  return null;
}
