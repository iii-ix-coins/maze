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
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);

  const walletRootRef = useRef<HTMLDivElement>(null);
  const walletButtonRef = useRef<HTMLButtonElement>(null);
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
    const prev = snapshotRef.current;
    if (prev.address === next.address && prev.isConnected === next.isConnected && prev.status === next.status) return;
    snapshotRef.current = next;
    setSnapshot(next);
    if (!next.isConnected) setWalletMenuOpen(false);
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

  useEffect(() => {
    if (!walletMenuOpen) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      if (!walletRootRef.current?.contains(event.target as Node)) {
        setWalletMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setWalletMenuOpen(false);
      walletButtonRef.current?.focus();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [walletMenuOpen]);

  // A click that arrived before the runtime was ready (or while restoring a session) opens the modal here.
  useEffect(() => {
    if (!pendingOpen || !openReady) return undefined;

    const fire = () => {
      setPendingOpen(false);
      const options: WalletOpenOptions = snapshotRef.current.isConnected
        ? { view: 'Account' }
        : { view: 'Connect', namespace: 'solana' };
      // Open on the next task: not inside the click dispatch nor React's effect flush,
      // so the click can finish and AppKit's heavy first render does not block the commit.
      window.setTimeout(() => {
        try {
          void Promise.resolve(openRef.current?.(options)).catch((error: unknown) => {
            console.error('[wallet] failed to open the wallet modal', error);
          });
        } catch (error) {
          console.error('[wallet] failed to open the wallet modal', error);
        }
      }, 0);
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
      <div className="nav-wallet-wrap" ref={walletRootRef}>
        <button
          ref={walletButtonRef}
          className={`nav-wallet-button${isConnected ? ' is-connected' : ''}`}
          type="button"
          data-nav-action="connect-wallet"
          data-wallet-status={status ?? 'disconnected'}
          data-wallet-load={loadState}
          aria-busy={isBusy}
          aria-haspopup={isConnected ? 'menu' : undefined}
          aria-expanded={isConnected ? walletMenuOpen : undefined}
          aria-controls={isConnected && walletMenuOpen ? 'nav-wallet-menu' : undefined}
          aria-label={isConnected ? `Wallet ${address ?? ''}. Open profile and wallet menu` : 'Connect Solana wallet'}
          title={loadState === 'error' ? 'Wallet failed to load. Click to retry.' : undefined}
          onPointerEnter={loadRuntime}
          onFocus={loadRuntime}
          onTouchStart={loadRuntime}
          onClick={() => {
            if (snapshot.isConnected) {
              setWalletMenuOpen((current) => !current);
              return;
            }
            setWalletMenuOpen(false);
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

        {isConnected && walletMenuOpen ? (
          <div className="nav-wallet-menu" id="nav-wallet-menu" role="menu" aria-label="Wallet options">
            <a
              className="nav-wallet-menu-item"
              href="/profile"
              role="menuitem"
              onClick={() => setWalletMenuOpen(false)}
            >
              <span className="nav-wallet-menu-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="3.2" />
                  <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
                </svg>
              </span>
              <span>Profile</span>
            </a>
            <button
              className="nav-wallet-menu-item"
              type="button"
              role="menuitem"
              onClick={() => {
                setWalletMenuOpen(false);
                setPendingOpen(true);
                loadRuntime();
              }}
            >
              <span className="nav-wallet-menu-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="6" width="18" height="14" rx="2" />
                  <path d="M3 9h18M16 14h2" />
                </svg>
              </span>
              <span>Wallet</span>
            </button>
          </div>
        ) : null}
      </div>
      {Runtime ? <Runtime.Component onSnapshot={handleSnapshot} onReady={handleReady} /> : null}
    </>
  );
}
