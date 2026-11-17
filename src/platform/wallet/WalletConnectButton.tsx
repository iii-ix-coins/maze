import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import type {
  WalletOpenFn,
  WalletOpenOptions,
  WalletRuntimeProps,
  WalletSnapshot,
} from './WalletConnectRuntime'; // type-only: does not pull the AppKit bundle

/** Read here (not from ./appkit) so the heavy SDK stays out of the main bundle. */
const isConfigured = String(import.meta.env.VITE_REOWN_PROJECT_ID ?? '').trim().length > 0;

/** Max time a click waits for AppKit to finish restoring a previous session. */
const RECONNECT_GRACE_MS = 3000;
/** Fallback delay where requestIdleCallback is missing (Safari). */
const IDLE_FALLBACK_MS = 1500;
/** localStorage prefixes AppKit / WalletConnect use for persisted sessions. */
const SESSION_KEY_PREFIXES = ['@appkit/', 'wc@2:'];

type LoadState = 'idle' | 'loading' | 'ready' | 'error';
type RuntimeComponent = ComponentType<WalletRuntimeProps>;

const DISCONNECTED: WalletSnapshot = { address: undefined, isConnected: false, status: undefined };

function shortenAddress(address: string | undefined): string {
  if (!address) return 'Wallet Connected';
  return address.length <= 14 ? address : `${address.slice(0, 5)}…${address.slice(-5)}`;
}

function hasStoredWalletSession(): boolean {
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && SESSION_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) return true;
    }
  } catch {
    // Storage can be unavailable in privacy-restricted contexts.
  }
  return false;
}

function scheduleIdle(task: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(task, { timeout: 4000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(task, IDLE_FALLBACK_MS);
  return () => window.clearTimeout(id);
}

export function WalletConnectButton() {
  const [Runtime, setRuntime] = useState<{ Component: RuntimeComponent } | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [snapshot, setSnapshot] = useState<WalletSnapshot>(DISCONNECTED);
  const [openReady, setOpenReady] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);

  const openRef = useRef<WalletOpenFn | null>(null);
  const snapshotRef = useRef<WalletSnapshot>(DISCONNECTED);
  const loadingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /** Loads the AppKit runtime once; a failed load (offline, stale chunk) can be retried. */
  const loadRuntime = useCallback(() => {
    if (!isConfigured || loadingRef.current) return;
    loadingRef.current = true;
    setLoadState('loading');
    import('./WalletConnectRuntime')
      .then((module) => {
        if (!mountedRef.current) return;
        setRuntime({ Component: module.WalletRuntime });
        setLoadState('ready');
      })
      .catch((error: unknown) => {
        console.error('[wallet] failed to load the wallet runtime', error);
        loadingRef.current = false;
        if (!mountedRef.current) return;
        setLoadState('error');
        setPendingOpen(false);
      });
  }, []);

  const handleSnapshot = useCallback((next: WalletSnapshot) => {
    snapshotRef.current = next;
    setSnapshot(next);
  }, []);

  const handleReady = useCallback((open: WalletOpenFn | null) => {
    openRef.current = open;
    setOpenReady(open !== null);
  }, []);

  // Returning users: boot on idle so the session is restored and the first click is instant.
  useEffect(() => {
    if (!isConfigured || !hasStoredWalletSession()) return undefined;
    return scheduleIdle(loadRuntime);
  }, [loadRuntime]);

  // A click that arrived before the runtime was ready (or while restoring a session) opens the modal here.
  useEffect(() => {
    if (!pendingOpen || !openReady) return undefined;

    const fire = () => {
      setPendingOpen(false);
      const options: WalletOpenOptions = snapshotRef.current.isConnected
        ? { view: 'Account' }
        : { view: 'Connect', namespace: 'solana' };
      try {
        void Promise.resolve(openRef.current?.(options)).catch((error: unknown) => {
          console.error('[wallet] failed to open the wallet modal', error);
        });
      } catch (error) {
        console.error('[wallet] failed to open the wallet modal', error);
      }
    };

    if (snapshot.status !== 'reconnecting') {
      fire();
      return undefined;
    }
    const timer = window.setTimeout(fire, RECONNECT_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, [pendingOpen, openReady, snapshot.status]);

  if (!isConfigured) {
    return (
      <button
        className="nav-wallet-button"
        type="button"
        data-nav-action="connect-wallet"
        disabled
        title="Set VITE_REOWN_PROJECT_ID in the build environment to enable wallet connections."
        aria-label="Wallet connection is not configured"
      >
        <span>Connect Wallet</span>
      </button>
    );
  }

  const { address, isConnected, status } = snapshot;
  const isConnecting = status === 'connecting' || status === 'reconnecting';
  const isLoading = pendingOpen && !openReady && loadState !== 'error';
  const isBusy = isConnecting || isLoading;

  return (
    <>
      <button
        className={`nav-wallet-button${isConnected ? ' is-connected' : ''}`}
        type="button"
        data-nav-action="connect-wallet"
        data-wallet-status={status ?? 'disconnected'}
        data-wallet-load={loadState}
        aria-busy={isBusy}
        aria-label={isConnected ? `Wallet ${address ?? ''}. Open wallet options` : 'Connect Solana wallet'}
        title={loadState === 'error' ? 'Wallet failed to load. Click to retry.' : undefined}
        onPointerEnter={loadRuntime}
        onFocus={loadRuntime}
        onTouchStart={loadRuntime}
        onClick={() => {
          setPendingOpen(true);
          loadRuntime();
        }}
      >
        {isConnected ? (
          <>
            <span className="nav-wallet-indicator" aria-hidden="true" />
            <span className="nav-wallet-address">{shortenAddress(address)}</span>
          </>
        ) : (
          <span>{isConnecting ? 'Connecting…' : isLoading ? 'Loading wallet…' : 'Connect Wallet'}</span>
        )}
      </button>
      {Runtime ? <Runtime.Component onSnapshot={handleSnapshot} onReady={handleReady} /> : null}
    </>
  );
}
