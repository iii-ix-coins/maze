import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import { getSiteRoutePath } from '../../app/routes';
import { useIdentity } from '../identity/IdentityProvider';
import { UserAvatar } from '../../components/account/UserAvatar';
import type {
  WalletDisconnectFn,
  WalletOpenFn,
  WalletOpenOptions,
  WalletRuntimeProps,
  WalletSignMessageFn,
  WalletSnapshot,
} from './WalletConnectRuntime'; // type-only: does not pull the AppKit bundle

/** Read here (not from ./appkit) so the heavy SDK stays out of the main bundle. */
const isConfigured = String(import.meta.env.VITE_REOWN_PROJECT_ID ?? '').trim().length > 0;

/** Max time a click waits for AppKit to finish restoring a previous session. */
const RECONNECT_GRACE_MS = 3000;
/** Fallback delay where requestIdleCallback is missing (Safari). */
const IDLE_FALLBACK_MS = 1500;
/** localStorage prefixes AppKit / WalletConnect use for persisted wallet sessions. */
const SESSION_KEY_PREFIXES = ['@appkit/', 'wc@2:'];

type LoadState = 'idle' | 'loading' | 'ready' | 'error';
type RuntimeComponent = ComponentType<WalletRuntimeProps>;

const DISCONNECTED: WalletSnapshot = { address: undefined, isConnected: false, status: undefined };

function shortenAddress(address: string | undefined): string {
  if (!address) return 'Wallet Connected';
  return address.length <= 14 ? address : `${address.slice(0, 5)}…${address.slice(-5)}`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
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
  const { status: identityStatus, isAuthenticated, user, error: identityError, login, logout } = useIdentity();
  const [Runtime, setRuntime] = useState<{ Component: RuntimeComponent } | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [snapshot, setSnapshot] = useState<WalletSnapshot>(DISCONNECTED);
  const [openReady, setOpenReady] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [disconnectReady, setDisconnectReady] = useState(false);
  const [disconnectPending, setDisconnectPending] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [loginPending, setLoginPending] = useState(false);
  const [signerReady, setSignerReady] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const walletRootRef = useRef<HTMLDivElement>(null);
  const walletButtonRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef<WalletOpenFn | null>(null);
  const disconnectRef = useRef<WalletDisconnectFn | null>(null);
  const signMessageRef = useRef<WalletSignMessageFn | null>(null);
  const snapshotRef = useRef<WalletSnapshot>(DISCONNECTED);
  const loadingRef = useRef(false);
  const mountedRef = useRef(true);
  const loginAfterConnectRef = useRef(false);
  const loginAttemptRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /** Loads the AppKit runtime once; a failed load can be retried. */
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
        loginAfterConnectRef.current = false;
      });
  }, []);

  const handleSnapshot = useCallback((next: WalletSnapshot) => {
    const previous = snapshotRef.current;
    if (previous.address === next.address && previous.isConnected === next.isConnected && previous.status === next.status) return;
    snapshotRef.current = next;
    setSnapshot(next);
    if (!next.isConnected) {
      setWalletMenuOpen(false);
      setDisconnectPending(false);
      setActionError(null);
      loginAttemptRef.current = false;
    }
  }, []);

  const handleReady = useCallback((open: WalletOpenFn | null) => {
    openRef.current = open;
    setOpenReady(open !== null);
  }, []);

  const handleDisconnectReady = useCallback((disconnect: WalletDisconnectFn | null) => {
    disconnectRef.current = disconnect;
    setDisconnectReady(disconnect !== null);
  }, []);

  const handleSignMessageReady = useCallback((signMessage: WalletSignMessageFn | null) => {
    signMessageRef.current = signMessage;
    setSignerReady(signMessage !== null);
  }, []);

  const performLogin = useCallback(async () => {
    const address = snapshotRef.current.address;
    const signMessage = signMessageRef.current;
    if (!snapshotRef.current.isConnected || !address || !signMessage || loginAttemptRef.current) return;

    loginAttemptRef.current = true;
    setActionError(null);
    setLoginPending(true);
    try {
      await login({ walletAddress: address, signMessage });
      setWalletMenuOpen(false);
      setActionError(null);
    } catch (error) {
      setActionError(getErrorMessage(error, 'Wallet sign-in was not completed.'));
      setWalletMenuOpen(true);
      loginAttemptRef.current = false;
    } finally {
      setLoginPending(false);
    }
  }, [login]);

  const handleDisconnect = useCallback(async () => {
    const disconnect = disconnectRef.current;
    if (!disconnect || disconnectPending) return;

    setActionError(null);
    setDisconnectPending(true);
    try {
      // Disconnecting a wallet does not revoke the independent Maze account session.
      await Promise.resolve(disconnect());
      setWalletMenuOpen(false);
    } catch (error) {
      console.error('[wallet] failed to disconnect the Solana wallet', error);
      setActionError('Could not disconnect. Please try again.');
    } finally {
      setDisconnectPending(false);
    }
  }, [disconnectPending]);

  const handleLogout = useCallback(async () => {
    if (logoutPending) return;
    setActionError(null);
    setLogoutPending(true);
    try {
      // Logout revokes the server session but intentionally leaves the wallet transport connected.
      await logout();
      setWalletMenuOpen(false);
      loginAttemptRef.current = false;
    } catch (error) {
      setActionError(getErrorMessage(error, 'Could not sign out. Please try again.'));
    } finally {
      setLogoutPending(false);
    }
  }, [logout, logoutPending]);

  // Returning users: restore the wallet session on idle; AppKit remains out of the initial bundle.
  useEffect(() => {
    if (!isConfigured || !hasStoredWalletSession()) return undefined;
    return scheduleIdle(loadRuntime);
  }, [loadRuntime]);

  useEffect(() => {
    if (!walletMenuOpen) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      if (!walletRootRef.current?.contains(event.target as Node)) setWalletMenuOpen(false);
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

  // A first-time explicit connect intent proceeds to the separate SIWS signature prompt.
  useEffect(() => {
    if (!loginAfterConnectRef.current || identityStatus === 'checking') return;
    if (identityStatus === 'authenticated') {
      loginAfterConnectRef.current = false;
      return;
    }
    if (snapshot.isConnected && snapshot.address && signerReady && !loginAttemptRef.current) {
      loginAfterConnectRef.current = false;
      void performLogin();
    }
  }, [snapshot.isConnected, snapshot.address, signerReady, identityStatus, performLogin]);

  // A click that arrived before the runtime was ready opens the official AppKit modal.
  useEffect(() => {
    if (!pendingOpen || !openReady) return undefined;

    const fire = () => {
      setPendingOpen(false);
      const options: WalletOpenOptions = snapshotRef.current.isConnected
        ? { view: 'Account' }
        : { view: 'Connect', namespace: 'solana' };
      // Defer the first AppKit render until after the click event has completed.
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

  if (!isConfigured && !isAuthenticated && !snapshot.isConnected) {
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
  const isBusy = isConnecting || isLoading || loginPending;
  const displayName = user?.username || shortenAddress(user?.walletAddress || address);
  const accountSeed = user?.id || address || user?.walletAddress || 'maze-user';
  const isMenuAvailable = isConnected || isAuthenticated;

  return (
    <>
      <div className="nav-wallet-wrap" ref={walletRootRef}>
        <button
          ref={walletButtonRef}
          className={`nav-wallet-button${isConnected || isAuthenticated ? ' is-connected' : ''}${isAuthenticated ? ' is-authenticated' : ''}`}
          type="button"
          data-nav-action="connect-wallet"
          data-wallet-status={status ?? 'disconnected'}
          data-wallet-load={loadState}
          data-identity-status={identityStatus}
          aria-busy={isBusy}
          aria-haspopup={isMenuAvailable ? 'menu' : undefined}
          aria-expanded={isMenuAvailable ? walletMenuOpen : undefined}
          aria-controls={isMenuAvailable && walletMenuOpen ? 'nav-wallet-menu' : undefined}
          aria-label={isAuthenticated ? `Maze account ${displayName}. Open account menu` : isConnected ? `Wallet ${address ?? ''}. Open wallet menu` : 'Connect Solana wallet'}
          title={loadState === 'error' ? 'Wallet failed to load. Click to retry.' : undefined}
          onPointerEnter={loadRuntime}
          onFocus={loadRuntime}
          onTouchStart={loadRuntime}
          onClick={() => {
            if (isMenuAvailable) {
              setActionError(null);
              setWalletMenuOpen((current) => !current);
              return;
            }
            loginAfterConnectRef.current = true;
            setPendingOpen(true);
            loadRuntime();
          }}
        >
          {isAuthenticated && user ? (
            <>
              <UserAvatar seed={accountSeed} imageUrl={user.avatarUrl} />
              <span className="nav-wallet-address">{displayName}</span>
            </>
          ) : isConnected ? (
            <>
              <span className="nav-wallet-indicator" aria-hidden="true" />
              <span className="nav-wallet-address">{shortenAddress(address)}</span>
            </>
          ) : (
            <span>{isConnecting ? 'Connecting…' : isLoading ? 'Loading wallet…' : 'Connect Wallet'}</span>
          )}
        </button>

        {isMenuAvailable && walletMenuOpen ? (
          <div className="nav-wallet-menu" id="nav-wallet-menu" role="menu" aria-label={isAuthenticated ? 'Account options' : 'Wallet options'} aria-busy={disconnectPending || logoutPending || loginPending}>
            {isAuthenticated ? (
              <a
                className="nav-wallet-menu-item"
                href={getSiteRoutePath('profile')}
                role="menuitem"
                onClick={() => setWalletMenuOpen(false)}
              >
                <span className="nav-wallet-menu-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="3.2" />
                    <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
                  </svg>
                </span>
                <span className="nav-wallet-menu-label">Profile</span>
              </a>
            ) : (
              <button
                className="nav-wallet-menu-item"
                type="button"
                role="menuitem"
                disabled={!signerReady || loginPending || identityStatus === 'checking'}
                onClick={() => { void performLogin(); }}
              >
                <span className="nav-wallet-menu-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3v12m-5-5 5 5 5-5" />
                    <path d="M5 19h14" />
                  </svg>
                </span>
                <span className="nav-wallet-menu-label">{loginPending ? 'Signing in…' : 'Sign in to Maze'}</span>
              </button>
            )}

            <button
              className="nav-wallet-menu-item"
              type="button"
              role="menuitem"
              disabled={!isConfigured || (!openReady && loadState === 'loading')}
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
              <span className="nav-wallet-menu-label">Wallet</span>
            </button>

            {isConnected ? (
              <button
                className="nav-wallet-menu-item"
                type="button"
                role="menuitem"
                disabled={!disconnectReady || disconnectPending}
                onClick={() => { void handleDisconnect(); }}
              >
                <span className="nav-wallet-menu-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2.8v9.1" />
                    <path d="M7.2 5.8a8 8 0 1 0 9.6 0" />
                  </svg>
                </span>
                <span className="nav-wallet-menu-label" aria-live="polite">{disconnectPending ? 'Disconnecting…' : 'Disconnect wallet'}</span>
              </button>
            ) : null}

            {isAuthenticated ? (
              <button
                className="nav-wallet-menu-item"
                type="button"
                role="menuitem"
                disabled={logoutPending}
                onClick={() => { void handleLogout(); }}
              >
                <span className="nav-wallet-menu-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5" />
                    <path d="M14 16l4-4-4-4m4 4H9" />
                  </svg>
                </span>
                <span className="nav-wallet-menu-label">{logoutPending ? 'Signing out…' : 'Logout'}</span>
              </button>
            ) : null}

            {actionError || identityError ? (
              <span className="nav-wallet-menu-error" role="alert">{actionError || identityError}</span>
            ) : null}
          </div>
        ) : null}
      </div>
      {Runtime ? (
        <Runtime.Component
          onSnapshot={handleSnapshot}
          onReady={handleReady}
          onDisconnectReady={handleDisconnectReady}
          onSignMessageReady={handleSignMessageReady}
        />
      ) : null}
    </>
  );
}
