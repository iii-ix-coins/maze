import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import { getSiteRoutePath } from '../../app/routes';
import { useIdentity } from '../identity/IdentityProvider';
import { UserAvatar } from '../../components/account/UserAvatar';
import { runWalletSessionTeardown, WalletSessionTeardownError } from './wallet-session-teardown';
import type {
  WalletDisconnectFn,
  WalletOpenFn,
  WalletOpenOptions,
  WalletRuntimeProps,
  WalletSignInFn,
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
  const [endSessionPending, setEndSessionPending] = useState(false);
  const [loginPending, setLoginPending] = useState(false);
  const [signInReady, setSignInReady] = useState(false);
  const [signMessageReady, setSignMessageReady] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const walletRootRef = useRef<HTMLDivElement>(null);
  const walletButtonRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef<WalletOpenFn | null>(null);
  const disconnectRef = useRef<WalletDisconnectFn | null>(null);
  const signInRef = useRef<WalletSignInFn | null>(null);
  const signMessageRef = useRef<WalletSignMessageFn | null>(null);
  const snapshotRef = useRef<WalletSnapshot>(DISCONNECTED);
  const loadingRef = useRef(false);
  const mountedRef = useRef(true);
  const loginAfterConnectRef = useRef(false);
  const loginAttemptRef = useRef(false);
  const endSessionInFlightRef = useRef(false);
  const walletSyncLogoutInFlightRef = useRef(false);
  const endSessionHadAccountRef = useRef(false);
  const observedConnectedWalletRef = useRef<string | null>(null);
  const pendingWalletDisconnectRef = useRef(false);

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

    // Record connection edges synchronously with the provider event. This avoids
    // missing a fast connect/disconnect pair before React commits the next effect.
    if (next.isConnected && next.address) {
      observedConnectedWalletRef.current = next.address;
      pendingWalletDisconnectRef.current = false;
    } else if (previous.isConnected) {
      observedConnectedWalletRef.current = null;
      pendingWalletDisconnectRef.current = true;
    }

    if (!next.isConnected) {
      if (previous.isConnected) loginAfterConnectRef.current = false;
      setWalletMenuOpen(false);
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

  const handleSignInReady = useCallback((signIn: WalletSignInFn | null) => {
    signInRef.current = signIn;
    setSignInReady(signIn !== null);
  }, []);

  const handleSignMessageReady = useCallback((signMessage: WalletSignMessageFn | null) => {
    signMessageRef.current = signMessage;
    setSignMessageReady(signMessage !== null);
  }, []);

  const performLogin = useCallback(async () => {
    const address = snapshotRef.current.address;
    const signIn = signInRef.current;
    const signMessage = signMessageRef.current;
    if (!snapshotRef.current.isConnected || !address || (!signIn && !signMessage) || loginAttemptRef.current) return;

    loginAttemptRef.current = true;
    setWalletMenuOpen(false);
    setActionError(null);
    setLoginPending(true);
    try {
      await login({
        walletAddress: address,
        signIn: signIn ?? undefined,
        signMessage: signIn ? undefined : signMessage ?? undefined,
        isWalletConnected: () => snapshotRef.current.isConnected && snapshotRef.current.address === address,
      });
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

  /**
   * Ends the Maze account session and the active wallet connection as one user action.
   * Revoke the server session first; if that fails, keep the wallet connected so the
   * user is not left in an ambiguous half-signed-out state.
   */
  const handleEndSession = useCallback(async () => {
    if (endSessionInFlightRef.current) return;

    const shouldLogout = isAuthenticated;
    const shouldDisconnect = snapshotRef.current.isConnected;
    if (!shouldLogout && !shouldDisconnect) return;

    endSessionInFlightRef.current = true;
    endSessionHadAccountRef.current = shouldLogout;
    setEndSessionPending(true);
    setActionError(null);

    try {
      await runWalletSessionTeardown({
        hasAuthenticatedSession: shouldLogout,
        isWalletConnected: () => shouldDisconnect && snapshotRef.current.isConnected,
        logout,
        disconnect: disconnectRef.current
          ? () => disconnectRef.current?.()
          : undefined,
      });
      if (shouldLogout) loginAttemptRef.current = false;
      setWalletMenuOpen(false);
      setActionError(null);
    } catch (endError) {
      console.error('[wallet] failed to complete the account disconnect action', endError);
      if (endError instanceof WalletSessionTeardownError && endError.sessionRevoked) {
        // The account is already safely signed out, even though transport cleanup failed.
        // Clear the successful-login lock so a still-connected wallet can sign in again.
        loginAttemptRef.current = false;
        if (snapshotRef.current.isConnected) {
          setActionError('You are signed out, but the wallet is still connected. Select “Disconnect wallet” to finish.');
        } else {
          // Some providers can report a disconnect error after emitting the disconnected
          // state. In that case the desired final state has already been reached.
          setActionError(null);
          setWalletMenuOpen(false);
        }
      } else {
        setActionError(getErrorMessage(endError, 'Could not finish signing out. Please try again.'));
      }
    } finally {
      endSessionInFlightRef.current = false;
      setEndSessionPending(false);
    }
  }, [isAuthenticated, logout]);

  /**
   * A disconnect made inside the Reown modal or in the wallet itself is also an
   * explicit disconnect intent. Keep the Maze session in sync with that action.
   */
  const logoutAfterWalletChange = useCallback(async (reason: 'disconnected' | 'account-changed') => {
    if (!isAuthenticated || endSessionInFlightRef.current || walletSyncLogoutInFlightRef.current) return;

    walletSyncLogoutInFlightRef.current = true;
    endSessionInFlightRef.current = true;
    endSessionHadAccountRef.current = true;
    setEndSessionPending(true);
    setActionError(null);

    try {
      await logout();
      loginAttemptRef.current = false;
      setWalletMenuOpen(false);
    } catch (syncError) {
      const detail = getErrorMessage(syncError, 'Please try signing out again.');
      setActionError(reason === 'disconnected'
        ? `The wallet is disconnected, but the Maze session could not be closed. ${detail}`
        : `The active wallet changed, but the previous Maze session could not be closed. ${detail}`);
      // Keep the account menu available so the user can retry the remaining Logout action.
      setWalletMenuOpen(true);
    } finally {
      walletSyncLogoutInFlightRef.current = false;
      endSessionInFlightRef.current = false;
      setEndSessionPending(false);
    }
  }, [isAuthenticated, logout]);

  // Returning users: restore the wallet session on idle; AppKit remains out of the initial bundle.
  useEffect(() => {
    if (!isConfigured || !hasStoredWalletSession()) return undefined;
    return scheduleIdle(loadRuntime);
  }, [loadRuntime]);

  // Keep an authenticated Maze account bound to the wallet that proved ownership.
  // A stable external disconnect or account switch revokes that account session.
  // AppKit's reconnecting/connecting states are transient and must never log users out.
  useEffect(() => {
    if (snapshot.isConnected && snapshot.address) {
      observedConnectedWalletRef.current = snapshot.address;
      pendingWalletDisconnectRef.current = false;

      if (isAuthenticated && user?.walletAddress && user.walletAddress !== snapshot.address) {
        void logoutAfterWalletChange('account-changed');
      }
      return;
    }

    if (snapshot.status === 'connecting' || snapshot.status === 'reconnecting') return;

    if (observedConnectedWalletRef.current) {
      observedConnectedWalletRef.current = null;
      pendingWalletDisconnectRef.current = true;
    }

    if (!pendingWalletDisconnectRef.current) return;
    if (identityStatus === 'checking' || identityStatus === 'authenticating') return;

    pendingWalletDisconnectRef.current = false;
    if (isAuthenticated) {
      void logoutAfterWalletChange('disconnected');
    }
  }, [
    snapshot.isConnected,
    snapshot.address,
    snapshot.status,
    identityStatus,
    isAuthenticated,
    user?.walletAddress,
    logoutAfterWalletChange,
  ]);

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

  // Explicit connect intent continues straight into Maze authentication once the wallet is ready.
  const authenticatorReady = signInReady || signMessageReady;
  useEffect(() => {
    if (!loginAfterConnectRef.current || identityStatus === 'checking') return;
    if (identityStatus === 'authenticated') {
      loginAfterConnectRef.current = false;
      setWalletMenuOpen(true);
      return;
    }
    if (snapshot.isConnected && snapshot.address && authenticatorReady && !loginAttemptRef.current) {
      loginAfterConnectRef.current = false;
      void performLogin();
    }
  }, [snapshot.isConnected, snapshot.address, authenticatorReady, identityStatus, performLogin]);

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
  const isBusy = isConnecting || isLoading || loginPending || endSessionPending;
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
          disabled={isBusy}
          aria-haspopup={isAuthenticated ? 'menu' : undefined}
          aria-expanded={isAuthenticated ? walletMenuOpen : undefined}
          aria-controls={isAuthenticated && walletMenuOpen ? 'nav-wallet-menu' : undefined}
          aria-label={isAuthenticated ? `Maze account ${displayName}. Open account menu` : isConnected ? `Sign in to Maze with ${address ?? 'connected wallet'}` : 'Connect Solana wallet'}
          title={loadState === 'error' ? 'Wallet failed to load. Click to retry.' : undefined}
          onPointerEnter={loadRuntime}
          onFocus={loadRuntime}
          onTouchStart={loadRuntime}
          onClick={() => {
            setActionError(null);
            if (isAuthenticated) {
              setWalletMenuOpen((current) => !current);
              return;
            }
            // If a wallet is already connected, the primary action is Maze sign-in,
            // never opening a menu that asks the user to click a second sign-in button.
            loginAfterConnectRef.current = true;
            if (isConnected) {
              if (identityStatus !== 'checking' && authenticatorReady && !loginAttemptRef.current) {
                loginAfterConnectRef.current = false;
                void performLogin();
              }
              return;
            }
            setPendingOpen(true);
            loadRuntime();
          }}
        >
          {isAuthenticated && user ? (
            endSessionPending ? (
              <span className="nav-wallet-address">Signing out…</span>
            ) : (
              <>
                <UserAvatar seed={accountSeed} imageUrl={user.avatarUrl} />
                <span className="nav-wallet-address">{displayName}</span>
              </>
            )
          ) : isConnected ? (
            <>
              <span className="nav-wallet-indicator" aria-hidden="true" />
              <span className="nav-wallet-address">{loginPending ? 'Signing in…' : endSessionPending ? 'Disconnecting…' : shortenAddress(address)}</span>
            </>
          ) : (
            <span>{isConnecting ? 'Connecting…' : isLoading ? 'Loading wallet…' : 'Connect Wallet'}</span>
          )}
        </button>

        {isConnected && !isAuthenticated ? (
          <button
            className="nav-wallet-options-button"
            type="button"
            aria-label="Open wallet options"
            disabled={loginPending || endSessionPending}
            aria-haspopup="menu"
            aria-expanded={walletMenuOpen}
            aria-controls={walletMenuOpen ? 'nav-wallet-menu' : undefined}
            onClick={() => {
              setActionError(null);
              setWalletMenuOpen((current) => !current);
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        ) : null}

        {isMenuAvailable && walletMenuOpen ? (
          <div className="nav-wallet-menu" id="nav-wallet-menu" role="menu" aria-label={isAuthenticated ? 'Account options' : 'Wallet options'} aria-busy={endSessionPending || loginPending}>
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
            ) : null}

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

            {(isConnected || isAuthenticated) ? (
              <button
                className="nav-wallet-menu-item"
                type="button"
                role="menuitem"
                disabled={endSessionPending || loginPending || (isConnected && !disconnectReady)}
                onClick={() => { void handleEndSession(); }}
              >
                <span className="nav-wallet-menu-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2.8v8.7" />
                    <path d="M7.2 5.8a8 8 0 1 0 9.6 0" />
                    {isAuthenticated ? <path d="M15.5 15.5 19 19m0-3.5V19h-3.5" /> : null}
                  </svg>
                </span>
                <span className="nav-wallet-menu-label" aria-live="polite">
                  {endSessionPending
                    ? (endSessionHadAccountRef.current
                      ? (snapshot.isConnected ? 'Disconnecting & signing out…' : 'Signing out…')
                      : 'Disconnecting…')
                    : isAuthenticated && isConnected
                      ? 'Disconnect & log out'
                      : isConnected
                        ? 'Disconnect wallet'
                        : 'Log out'}
                </span>
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
          onSignInReady={handleSignInReady}
          onSignMessageReady={handleSignMessageReady}
        />
      ) : null}
    </>
  );
}
