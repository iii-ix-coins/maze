import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AnimationEvent as ReactAnimationEvent,
  ComponentType,
} from 'react';
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
  WalletSigningStatus,
  WalletSnapshot,
} from './WalletConnectRuntime'; // type-only: does not pull the AppKit bundle

/** Read here (not from ./appkit) so the heavy SDK stays out of the main bundle. */
const isConfigured = String(import.meta.env.VITE_REOWN_PROJECT_ID ?? '').trim().length > 0;

/** Max time a click waits for AppKit to finish restoring a previous session. */
const RECONNECT_GRACE_MS = 3000;
/** Fallback delay where requestIdleCallback is missing (Safari). */
const IDLE_FALLBACK_MS = 1500;
/** Safety fallback in case the browser does not dispatch animationend. */
const WALLET_MENU_EXIT_FALLBACK_MS = 250;
/** Give AppKit a short window to publish the active provider after connection. */
const SIGNING_PROVIDER_TIMEOUT_MS = 5000;
/** localStorage prefixes AppKit / WalletConnect use for persisted wallet sessions. */
const SESSION_KEY_PREFIXES = ['@appkit/', 'wc@2:'];

type LoadState = 'idle' | 'loading' | 'ready' | 'error';
type PendingOpenIntent = 'connect-login' | 'wallet-menu';
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
  const [walletMenuClosing, setWalletMenuClosing] = useState(false);
  const walletMenuOpenRef = useRef(false);
  const walletMenuClosingRef = useRef(false);
  const [disconnectReady, setDisconnectReady] = useState(false);
  const [endSessionPending, setEndSessionPending] = useState(false);
  const [loginPending, setLoginPending] = useState(false);
  const [signInReady, setSignInReady] = useState(false);
  const [signMessageReady, setSignMessageReady] = useState(false);
  const [signingStatus, setSigningStatus] = useState<WalletSigningStatus>('checking');
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
  const [loginRequested, setLoginRequested] = useState(false);
  const [disconnectRecoveryRequired, setDisconnectRecoveryRequired] = useState(false);
  const connectModalExpectedRef = useRef(false);
  const connectModalOpenedRef = useRef(false);
  const connectModalCancelTimerRef = useRef<number | null>(null);
  const signerWaitTimerRef = useRef<number | null>(null);
  const pendingOpenIntentRef = useRef<PendingOpenIntent | null>(null);
  const loginAttemptRef = useRef(false);
  const endSessionInFlightRef = useRef(false);
  const walletSyncLogoutInFlightRef = useRef(false);
  const endSessionHadAccountRef = useRef(false);
  const observedConnectedWalletRef = useRef<string | null>(null);
  const pendingWalletDisconnectRef = useRef(false);
  const walletMenuCloseTimerRef = useRef<number | null>(null);

  // ============================================================
  // WALLET MENU — Unified open / close / animation lifecycle
  // ============================================================

  const clearWalletMenuCloseTimer = useCallback(() => {
    if (walletMenuCloseTimerRef.current !== null) {
      window.clearTimeout(walletMenuCloseTimerRef.current);
      walletMenuCloseTimerRef.current = null;
    }
  }, []);

  const finishWalletMenuClose = useCallback(() => {
    clearWalletMenuCloseTimer();
    walletMenuOpenRef.current = false;
    walletMenuClosingRef.current = false;
    setWalletMenuOpen(false);
    setWalletMenuClosing(false);
  }, [clearWalletMenuCloseTimer]);

  const openWalletMenu = useCallback(() => {
    clearWalletMenuCloseTimer();
    walletMenuOpenRef.current = true;
    walletMenuClosingRef.current = false;
    setWalletMenuClosing(false);
    setWalletMenuOpen(true);
  }, [clearWalletMenuCloseTimer]);

  const closeWalletMenu = useCallback(() => {
    if (!walletMenuOpenRef.current || walletMenuClosingRef.current) return;

    walletMenuClosingRef.current = true;
    setWalletMenuClosing(true);
    clearWalletMenuCloseTimer();

    // animationend is the primary completion path. This timer is a safety net
    // for reduced-motion styles, interrupted animations, or CSS being unavailable.
    walletMenuCloseTimerRef.current = window.setTimeout(
      finishWalletMenuClose,
      WALLET_MENU_EXIT_FALLBACK_MS,
    );
  }, [clearWalletMenuCloseTimer, finishWalletMenuClose]);

  const toggleWalletMenu = useCallback(() => {
    if (walletMenuOpenRef.current && !walletMenuClosingRef.current) {
      closeWalletMenu();
    } else {
      openWalletMenu();
    }
  }, [closeWalletMenu, openWalletMenu]);

  /** Remove the menu from the DOM only after its exit animation completes. */
  const handleWalletMenuAnimationEnd = useCallback(
    (event: ReactAnimationEvent<HTMLDivElement>) => {
      // Ignore animation events bubbling from menu children or entrance animations.
      if (event.target !== event.currentTarget) return;
      if (event.animationName !== 'maze-dropdown-out') return;
      if (!walletMenuClosingRef.current) return;

      finishWalletMenuClose();
    },
    [finishWalletMenuClose],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      clearWalletMenuCloseTimer();
      if (connectModalCancelTimerRef.current !== null) {
        window.clearTimeout(connectModalCancelTimerRef.current);
        connectModalCancelTimerRef.current = null;
      }
      if (signerWaitTimerRef.current !== null) {
        window.clearTimeout(signerWaitTimerRef.current);
        signerWaitTimerRef.current = null;
      }
    };
  }, [clearWalletMenuCloseTimer]);

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
        pendingOpenIntentRef.current = null;
        setLoginRequested(false);
        setActionError(getErrorMessage(error, 'Wallet connection could not be loaded.'));
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
      connectModalExpectedRef.current = false;
      connectModalOpenedRef.current = false;
      if (connectModalCancelTimerRef.current !== null) {
        window.clearTimeout(connectModalCancelTimerRef.current);
        connectModalCancelTimerRef.current = null;
      }
    } else if (previous.isConnected) {
      // A temporary disconnect edge can occur during AppKit reconnect/account
      // restoration. Record it for reconciliation, but do not cancel an explicit
      // login intent until the wallet reaches a stable disconnected state.
      observedConnectedWalletRef.current = null;
      pendingWalletDisconnectRef.current = true;
    }

    const isTransientWalletState = next.status === 'connecting' || next.status === 'reconnecting';
    if (!next.isConnected && !isTransientWalletState) {
      setLoginRequested(false);
      if (previous.isConnected) setDisconnectRecoveryRequired(false);

      closeWalletMenu();

      setActionError(null);
      loginAttemptRef.current = false;
    }
  }, [closeWalletMenu]);

  const handleReady = useCallback((open: WalletOpenFn | null) => {
    openRef.current = open;
    setOpenReady(open !== null);
  }, []);

  /**
   * A pending sign-in intent belongs to the Connect flow the user explicitly
   * opened. If they dismiss that modal without connecting, cancel the intent
   * so a later external wallet connection cannot trigger a surprise signature.
   */
  const handleModalOpenChange = useCallback((isOpen: boolean) => {
    if (isOpen) {
      // A quick reopen must supersede the cancellation grace timer from the
      // previous modal close, otherwise that stale timer could cancel this login.
      if (connectModalCancelTimerRef.current !== null) {
        window.clearTimeout(connectModalCancelTimerRef.current);
        connectModalCancelTimerRef.current = null;
      }
      if (connectModalExpectedRef.current) connectModalOpenedRef.current = true;
      return;
    }

    if (!connectModalExpectedRef.current || !connectModalOpenedRef.current) return;

    connectModalExpectedRef.current = false;
    connectModalOpenedRef.current = false;

    if (connectModalCancelTimerRef.current !== null) {
      window.clearTimeout(connectModalCancelTimerRef.current);
    }

    // Give the account subscription a short turn to publish a just-completed
    // connection before deciding that the user cancelled the Connect modal.
    connectModalCancelTimerRef.current = window.setTimeout(() => {
      connectModalCancelTimerRef.current = null;
      const current = snapshotRef.current;
      if (current.isConnected || current.status === 'connecting' || current.status === 'reconnecting') return;
      setLoginRequested(false);
      setPendingOpen(false);
      pendingOpenIntentRef.current = null;
    }, 120);
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

  const handleSigningStatusChange = useCallback((nextStatus: WalletSigningStatus) => {
    setSigningStatus(nextStatus);
  }, []);

  const performLogin = useCallback(async () => {
    const address = snapshotRef.current.address;
    const signIn = signInRef.current;
    const signMessage = signMessageRef.current;
    if (!snapshotRef.current.isConnected || !address || (!signIn && !signMessage) || loginAttemptRef.current) return;

    loginAttemptRef.current = true;
    closeWalletMenu();
    setActionError(null);
    setLoginPending(true);
    try {
      await login({
        walletAddress: address,
        signIn: signIn ?? undefined,
        signMessage: signIn ? undefined : signMessage ?? undefined,
        isWalletConnected: () => snapshotRef.current.isConnected && snapshotRef.current.address === address,
      });
      closeWalletMenu();
      setActionError(null);
    } catch (error) {
      setActionError(getErrorMessage(error, 'Wallet sign-in was not completed.'));
      setLoginRequested(false);
      loginAttemptRef.current = false;
    } finally {
      setLoginPending(false);
    }
  }, [login, closeWalletMenu]);

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
    closeWalletMenu();

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
      setDisconnectRecoveryRequired(false);
      closeWalletMenu();
      setActionError(null);
    } catch (endError) {
      console.error('[wallet] failed to complete the account disconnect action', endError);

      if (endError instanceof WalletSessionTeardownError && endError.sessionRevoked) {
        loginAttemptRef.current = false;

        if (snapshotRef.current.isConnected) {
          setDisconnectRecoveryRequired(true);
          setActionError(
            'Your Maze session is closed, but the wallet is still connected. Click the wallet button to retry disconnecting it.'
          );
        } else {
          setDisconnectRecoveryRequired(false);
          setActionError(null);
          closeWalletMenu();
        }
      } else {
        setActionError(
          getErrorMessage(endError, 'Could not finish signing out. Please try again.')
        );

        if (isAuthenticated) openWalletMenu();
      }
    } finally {
      endSessionInFlightRef.current = false;
      setEndSessionPending(false);
    }
  }, [isAuthenticated, logout, closeWalletMenu, openWalletMenu]);

  /**
   * A disconnect made the Reown modal or in the wallet itself is also an
   * explicit disconnect intent. Keep the Maze session in sync with that action.
   */
  const logoutAfterWalletChange = useCallback(async (reason: 'disconnected' | 'account-changed') => {
    if (!isAuthenticated || endSessionInFlightRef.current || walletSyncLogoutInFlightRef.current) return;

    walletSyncLogoutInFlightRef.current = true;
    endSessionInFlightRef.current = true;
    endSessionHadAccountRef.current = true;
    setEndSessionPending(true);
    setActionError(null);
    closeWalletMenu();

    try {
      await logout();
      loginAttemptRef.current = false;
      closeWalletMenu();
    } catch (syncError) {
      const detail = getErrorMessage(syncError, 'Please try signing out again.');
      setActionError(reason === 'disconnected'
        ? `The wallet is disconnected, but the Maze session could not be closed. ${detail}`
        : `The active wallet changed, but the previous Maze session could not be closed. ${detail}`);
      if (reason === 'account-changed') setLoginRequested(false);
      // With no connected wallet, the authenticated account menu is the only
      // place that can expose a retryable Log out action. For account mismatch,
      // keep the feedback on the main button because the old account menu is
      // intentionally hidden until the wallet identity is reconciled.
      if (reason === 'disconnected' && !snapshotRef.current.isConnected) {
        openWalletMenu();
      }
    } finally {
      walletSyncLogoutInFlightRef.current = false;
      endSessionInFlightRef.current = false;
      setEndSessionPending(false);
    }
  }, [isAuthenticated, logout, closeWalletMenu, openWalletMenu]);

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

      if (isAuthenticated && user?.walletAddress !== snapshot.address) {
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

  // Close wallet menu on outside click or Escape.
  // Keep the menu mounted until its exit animation finishes.
  useEffect(() => {
    if (!walletMenuOpen || walletMenuClosing) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      if (!walletRootRef.current?.contains(event.target as Node)) {
        closeWalletMenu();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;

      closeWalletMenu();
      walletButtonRef.current?.focus();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    walletMenuOpen,
    walletMenuClosing,
    closeWalletMenu,
  ]);

  // Only an explicit user action can request a signature. Restoring a persisted
  // AppKit wallet connection on page load never triggers a surprise SIWS prompt.
  // After the user starts Connect, continue automatically once the same wallet is
  // stably connected, Identity restoration is complete, and a signer is available.
  const authenticatorReady = signInReady || signMessageReady;

  // A provider can appear a moment after the account snapshot. Wait briefly,
  // but never leave the primary button locked forever for an unsupported wallet.
  useEffect(() => {
    if (!loginRequested || !snapshot.isConnected || signingStatus !== 'checking') return undefined;
    if (identityStatus === 'checking' || identityStatus === 'authenticating' || endSessionPending) return undefined;

    if (signerWaitTimerRef.current !== null) {
      window.clearTimeout(signerWaitTimerRef.current);
    }
    signerWaitTimerRef.current = window.setTimeout(() => {
      signerWaitTimerRef.current = null;
      if (!mountedRef.current || !snapshotRef.current.isConnected) return;
      if (signInRef.current || signMessageRef.current) return;
      setLoginRequested(false);
      setSigningStatus('unsupported');
      setActionError('The wallet signing provider is not ready. Reopen the wallet or choose a compatible Solana wallet.');
    }, SIGNING_PROVIDER_TIMEOUT_MS);

    return () => {
      if (signerWaitTimerRef.current !== null) {
        window.clearTimeout(signerWaitTimerRef.current);
        signerWaitTimerRef.current = null;
      }
    };
  }, [loginRequested, snapshot.isConnected, snapshot.address, signingStatus, identityStatus, endSessionPending]);

  useEffect(() => {
    if (!loginRequested) return;
    if (!snapshot.isConnected || !snapshot.address) return;
    if (snapshot.status === 'connecting' || snapshot.status === 'reconnecting') return;
    if (identityStatus === 'checking' || identityStatus === 'authenticating') return;
    if (endSessionPending || endSessionInFlightRef.current || loginAttemptRef.current) return;
    if (signingStatus === 'checking') return;

    if (isAuthenticated) {
      // A restored session for this same wallet is already authenticated. If it
      // belongs to another wallet, the reconciliation effect above revokes it;
      // preserve this explicit intent and sign in after that logout completes.
      if (user?.walletAddress === snapshot.address) setLoginRequested(false);
      return;
    }

    if (signingStatus === 'unsupported' || !authenticatorReady) {
      setLoginRequested(false);
      setActionError('This wallet does not support a compatible Solana sign-in method. Reopen the wallet and choose another wallet.');
      return;
    }

    if (identityStatus !== 'anonymous' && identityStatus !== 'error') return;

    setLoginRequested(false);
    void performLogin();
  }, [
    loginRequested,
    snapshot.isConnected,
    snapshot.address,
    snapshot.status,
    authenticatorReady,
    signingStatus,
    identityStatus,
    endSessionPending,
    isAuthenticated,
    user?.walletAddress,
    performLogin,
  ]);

  // A click that arrived before the runtime was ready opens the official AppKit modal.
  useEffect(() => {
    if (!pendingOpen || !openReady) return undefined;

    const fire = () => {
      setPendingOpen(false);
      const intent = pendingOpenIntentRef.current;
      pendingOpenIntentRef.current = null;
      const isAlreadyConnected = snapshotRef.current.isConnected;

      // If this was the primary Connect & sign-in action and AppKit restored
      // the wallet while the modal was being prepared, skip the unnecessary
      // Account modal. The explicit login intent effect will sign in directly.
      if (intent === 'connect-login' && isAlreadyConnected) return;

      const isConnectFlow = !isAlreadyConnected;
      const options: WalletOpenOptions = isConnectFlow
        ? { view: 'Connect', namespace: 'solana' }
        : { view: 'Account' };
      if (isConnectFlow) {
        if (connectModalCancelTimerRef.current !== null) {
          window.clearTimeout(connectModalCancelTimerRef.current);
          connectModalCancelTimerRef.current = null;
        }
        connectModalExpectedRef.current = true;
        connectModalOpenedRef.current = false;
      }
      // Defer the first AppKit render until after the click event has completed.
      window.setTimeout(() => {
        try {
          void Promise.resolve(openRef.current?.(options)).catch((error: unknown) => {
            console.error('[wallet] failed to open the wallet modal', error);
            if (isConnectFlow) {
              connectModalExpectedRef.current = false;
              connectModalOpenedRef.current = false;
              pendingOpenIntentRef.current = null;
              setLoginRequested(false);
              setActionError(getErrorMessage(error, 'Wallet connection could not be opened.'));
            }
          });
        } catch (error) {
          console.error('[wallet] failed to open the wallet modal', error);
          if (isConnectFlow) {
            connectModalExpectedRef.current = false;
            connectModalOpenedRef.current = false;
            pendingOpenIntentRef.current = null;
            setLoginRequested(false);
            setActionError(getErrorMessage(error, 'Wallet connection could not be opened.'));
          }
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
  const walletIdentityMismatch = Boolean(isAuthenticated && isConnected && user?.walletAddress !== address);
  const showAuthenticatedAccount = isAuthenticated && !walletIdentityMismatch;
  const isBusy = isConnecting || isLoading || loginRequested || loginPending || endSessionPending;
  const displayName = user?.username || shortenAddress(user?.walletAddress || address);
  const accountSeed = user?.id || address || user?.walletAddress || 'maze-user';

  return (
    <>
      <div className="nav-wallet-wrap" ref={walletRootRef}>
        <button
          ref={walletButtonRef}
          className={`nav-wallet-button${isConnected || isAuthenticated ? ' is-connected' : ''}${showAuthenticatedAccount ? ' is-authenticated' : ''}`}
          type="button"
          data-nav-action="connect-wallet"
          data-wallet-status={status ?? 'disconnected'}
          data-wallet-load={loadState}
          data-identity-status={identityStatus}
          aria-busy={isBusy}
          disabled={isBusy}
          aria-haspopup={showAuthenticatedAccount ? 'menu' : undefined}
          aria-expanded={showAuthenticatedAccount ? walletMenuOpen && !walletMenuClosing : undefined}
          aria-controls={showAuthenticatedAccount && (walletMenuOpen || walletMenuClosing) ? 'nav-wallet-menu' : undefined}
          aria-describedby={!showAuthenticatedAccount && actionError ? 'nav-wallet-feedback' : undefined}
          aria-label={disconnectRecoveryRequired
            ? 'Retry wallet disconnect'
            : showAuthenticatedAccount
              ? `Maze account ${displayName}. Open account menu`
              : isConnected && signingStatus === 'unsupported'
                ? 'Open wallet to choose a compatible signing provider'
                : isConnected
                  ? `Connected wallet ${address ?? ''}. Click to sign in to Maze`
                : 'Connect Solana wallet'}
          title={actionError || (disconnectRecoveryRequired
            ? 'The Maze session is closed. Click to retry wallet disconnect.'
            : loadState === 'error'
              ? 'Wallet failed to load. Click to retry.'
              : isConnected && !showAuthenticatedAccount && signingStatus === 'unsupported'
                ? 'This wallet cannot sign in. Click to reopen the wallet panel.'
                : isConnected && !showAuthenticatedAccount
                  ? 'Wallet connected. Click to sign in to Maze.'
                : undefined)}
          onPointerEnter={loadRuntime}
          onFocus={loadRuntime}
          onTouchStart={loadRuntime}
          onClick={() => {
            setActionError(null);

            if (disconnectRecoveryRequired) {
              void handleEndSession();
              return;
            }

            if (showAuthenticatedAccount) {
              toggleWalletMenu();
              return;
            }

            // An account switch must revoke the old account session first. Keep
            // the explicit login request armed so the new wallet signs in only
            // after that server-side logout succeeds.
            if (walletIdentityMismatch) {
              setLoginRequested(true);
              void logoutAfterWalletChange('account-changed');
              return;
            }

            // If the connected wallet cannot sign, let the user reopen Reown's
            // wallet panel to disconnect it and select a compatible provider.
            if (isConnected && signingStatus === 'unsupported') {
              pendingOpenIntentRef.current = 'wallet-menu';
              setPendingOpen(true);
              loadRuntime();
              return;
            }

            // Already-connected wallets go straight to the single Maze sign-in
            // request. A disconnected wallet opens Connect, then the effect above
            // continues automatically once AppKit publishes the stable account.
            setLoginRequested(true);
            if (isConnected) return;

            pendingOpenIntentRef.current = 'connect-login';
            setPendingOpen(true);
            loadRuntime();
          }}
        >
          {showAuthenticatedAccount && user ? (
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
              <span className="nav-wallet-address">
                {loginPending ? 'Signing in…' : loginRequested ? 'Preparing sign-in…' : endSessionPending ? 'Signing out…' : disconnectRecoveryRequired ? 'Retry disconnect' : signingStatus === 'unsupported' ? 'Choose wallet' : shortenAddress(address)}
              </span>
            </>
          ) : (
            <span>{isConnecting ? 'Connecting…' : isLoading ? 'Loading wallet…' : loginRequested ? 'Waiting for wallet…' : 'Connect Wallet'}</span>
          )}
        </button>

        {!showAuthenticatedAccount && (actionError || identityError) ? (
          <div id="nav-wallet-feedback" className="nav-wallet-feedback" role="alert">
            {actionError || identityError}
          </div>
        ) : null}

        {((showAuthenticatedAccount && walletMenuOpen) || walletMenuClosing) ? (
          <div
            className={`nav-wallet-menu${walletMenuClosing ? ' is-closing' : ''}`}
            id="nav-wallet-menu"
            role="menu"
            aria-label="Account options"
            aria-busy={endSessionPending || loginPending}
            aria-hidden={walletMenuClosing ? true : undefined}
            inert={walletMenuClosing}
            onAnimationEnd={handleWalletMenuAnimationEnd}
          >
            {(isAuthenticated || walletMenuClosing) ? (
              <a
                className="nav-wallet-menu-item"
                href={getSiteRoutePath('profile')}
                role="menuitem"
                tabIndex={walletMenuClosing ? -1 : undefined}
                onClick={closeWalletMenu}
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
              disabled={walletMenuClosing || !isConfigured || (!openReady && loadState === 'loading')}
              tabIndex={walletMenuClosing ? -1 : undefined}
              onClick={() => {
                closeWalletMenu();
                pendingOpenIntentRef.current = 'wallet-menu';
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

            {(isConnected || isAuthenticated || walletMenuClosing) ? (
              <button
                className="nav-wallet-menu-item"
                type="button"
                role="menuitem"
                disabled={walletMenuClosing || endSessionPending || loginPending || (isConnected && !disconnectReady)}
                tabIndex={walletMenuClosing ? -1 : undefined}
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
          onModalOpenChange={handleModalOpenChange}
          onDisconnectReady={handleDisconnectReady}
          onSignInReady={handleSignInReady}
          onSignMessageReady={handleSignMessageReady}
          onSigningStatusChange={handleSigningStatusChange}
        />
      ) : null}
    </>
  );
}
