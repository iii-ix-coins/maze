import { useEffect, useRef } from 'react';
import { useAppKit, useAppKitAccount, useAppKitProvider, useDisconnect } from '@reown/appkit/react';
import './appkit'; // Initialize the single AppKit instance before using its hooks.
import type { WalletSignIn, WalletSignInInput, WalletSignInOutput } from '../identity/identity-types';

export type WalletOpenOptions = Parameters<ReturnType<typeof useAppKit>['open']>[0];
export type WalletOpenFn = (options?: WalletOpenOptions) => unknown;
export type WalletDisconnectFn = () => unknown;
export type WalletSignMessageFn = (message: Uint8Array) => Promise<Uint8Array>;
export type WalletSignInFn = WalletSignIn;

type AppKitSolanaWalletProvider = {
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
  /** Present only when the active AppKit provider forwards Wallet Standard solana:signIn. */
  signIn?: (input: WalletSignInInput) => Promise<WalletSignInOutput>;
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
  /** Gives Identity Core the preferred Wallet Standard one-request signIn capability. */
  onSignInReady: (signIn: WalletSignInFn | null) => void;
  /** Compatibility signing capability for providers without solana:signIn. */
  onSignMessageReady: (signMessage: WalletSignMessageFn | null) => void;
};

/**
 * Bridge between AppKit hooks and Maze's persistent navigation button.
 * The button remains Maze-owned; the modal and its internal screens use the
 * unmodified, official Reown AppKit UI.
 */
export function WalletRuntime({ onSnapshot, onReady, onDisconnectReady, onSignInReady, onSignMessageReady }: WalletRuntimeProps) {
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
    if (typeof walletProvider?.signIn !== 'function') {
      onSignInReady(null);
    } else {
      const signIn: WalletSignInFn = async (input) => {
        const provider = walletProviderRef.current;
        if (!provider || typeof provider.signIn !== 'function') {
          throw new Error('The connected wallet does not expose Sign In With Solana.');
        }
        return provider.signIn.call(provider, input);
      };
      onSignInReady(signIn);
    }

    if (typeof walletProvider?.signMessage !== 'function') {
      onSignMessageReady(null);
      return () => {
        onSignInReady(null);
        onSignMessageReady(null);
      };
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
    return () => {
      onSignInReady(null);
      onSignMessageReady(null);
    };
  }, [walletProvider, onSignInReady, onSignMessageReady]);

  useEffect(() => {
    onSnapshot({ address, isConnected, status });
  }, [address, isConnected, status, onSnapshot]);

  return null;
}
