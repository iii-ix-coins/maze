import { useEffect, useRef } from 'react';
import { useAppKit, useAppKitAccount, useAppKitProvider, useDisconnect } from '@reown/appkit/react';
import './appkit'; // Initialize the single AppKit instance before using its hooks.

export type WalletOpenOptions = Parameters<ReturnType<typeof useAppKit>['open']>[0];
export type WalletOpenFn = (options?: WalletOpenOptions) => unknown;
export type WalletDisconnectFn = () => unknown;
export type WalletSignMessageFn = (message: Uint8Array) => Promise<Uint8Array>;

type AppKitSolanaWalletProvider = {
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
};

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
  /** Gives Identity Core a narrow message-signing capability without exposing AppKit. */
  onSignMessageReady: (signMessage: WalletSignMessageFn | null) => void;
};

/**
 * Bridge between AppKit hooks and Maze's persistent navigation button.
 * The button remains Maze-owned; the modal and its internal screens use the
 * unmodified, official Reown AppKit UI.
 */
export function WalletRuntime({ onSnapshot, onReady, onDisconnectReady, onSignMessageReady }: WalletRuntimeProps) {
  const { open } = useAppKit();
  const { disconnect } = useDisconnect();
  const { address, isConnected, status } = useAppKitAccount({ namespace: 'solana' });
  const { walletProvider } = useAppKitProvider<AppKitSolanaWalletProvider>('solana');

  const openRef = useRef(open);
  const disconnectRef = useRef(disconnect);
  const walletProviderRef = useRef(walletProvider);
  walletProviderRef.current = walletProvider;
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
    if (typeof walletProvider?.signMessage !== 'function') {
      onSignMessageReady(null);
      return () => onSignMessageReady(null);
    }

    const signMessage: WalletSignMessageFn = async (message) => {
      const provider = walletProviderRef.current;
      if (!provider || typeof provider.signMessage !== 'function') {
        throw new Error('The connected wallet does not support message signing.');
      }
      const signature = await provider.signMessage.call(provider, message);
      if (!(signature instanceof Uint8Array)) {
        throw new Error('The connected wallet returned an unsupported signature format.');
      }
      return signature;
    };

    onSignMessageReady(signMessage);
    return () => onSignMessageReady(null);
  }, [walletProvider, onSignMessageReady]);

  useEffect(() => {
    onSnapshot({ address, isConnected, status });
  }, [address, isConnected, status, onSnapshot]);

  return null;
}
