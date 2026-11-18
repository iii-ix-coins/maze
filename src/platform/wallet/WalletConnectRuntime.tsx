import { useEffect, useRef } from 'react';
import { useAppKit, useAppKitAccount, useDisconnect } from '@reown/appkit/react';
import './appkit'; // Initialize the single AppKit instance before using its hooks.

export type WalletOpenOptions = Parameters<ReturnType<typeof useAppKit>['open']>[0];
export type WalletOpenFn = (options?: WalletOpenOptions) => unknown;
export type WalletDisconnectFn = () => unknown;

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
  /** Exposes Reown's namespace-scoped disconnect action to the lazy-loaded nav button. */
  onDisconnectReady: (disconnect: WalletDisconnectFn | null) => void;
};

/**
 * Bridge between AppKit hooks and Maze's persistent navigation button.
 * The button remains Maze-owned; the modal and its internal screens use the
 * unmodified, official Reown AppKit UI.
 */
export function WalletRuntime({ onSnapshot, onReady, onDisconnectReady }: WalletRuntimeProps) {
  const { open } = useAppKit();
  const { disconnect } = useDisconnect();
  const { address, isConnected, status } = useAppKitAccount({ namespace: 'solana' });

  const openRef = useRef(open);
  const disconnectRef = useRef(disconnect);
  useEffect(() => {
    openRef.current = open;
  });

  useEffect(() => {
    onReady((options) => openRef.current(options));
    return () => onReady(null);
  }, [onReady]);

  useEffect(() => {
    disconnectRef.current = disconnect;
  }, [disconnect]);

  useEffect(() => {
    onDisconnectReady(() => disconnectRef.current({ namespace: 'solana' }));
    return () => onDisconnectReady(null);
  }, [onDisconnectReady]);

  useEffect(() => {
    onSnapshot({ address, isConnected, status });
  }, [address, isConnected, status, onSnapshot]);

  return null;
}
