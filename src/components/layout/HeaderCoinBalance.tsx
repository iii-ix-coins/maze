import { useCallback, useEffect, useState, type ComponentType } from 'react';
import { API_PATHS } from '../../services/api/contracts';
import { useIdentity } from '../../platform/identity/IdentityProvider';
import type { WalletRuntimeProps, WalletSnapshot } from '../../platform/wallet/WalletConnectRuntime';

type BalanceState = 'idle' | 'loading' | 'ready' | 'error';
type TokenBalanceResponse = {
  ok: true;
  owner: string;
  mintAddress: string;
  amount: string;
  decimals: number;
  tokenAccounts: number;
  slot: number | null;
  updatedAt: number;
  symbol: string;
};

type RuntimeComponent = ComponentType<WalletRuntimeProps>;

const walletConfigured = String(import.meta.env.VITE_REOWN_PROJECT_ID ?? '').trim().length > 0;
const BALANCE_REFRESH_MS = 30_000;


function formatHeaderAmount(value: string): string {
  if (!/^\d+(?:\.\d+)?$/.test(value)) return '—';
  const [integerPart, fractionPart = ''] = value.split('.');
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = fractionPart.slice(0, 4).replace(/0+$/, '');
  return fraction ? `${groupedInteger}.${fraction}` : groupedInteger;
}

/**
 * Shows the configured Solana mint balance for the authenticated identity or,
 * while signed out, for the currently connected Reown wallet.
 * The Reown runtime is loaded during browser idle so a restored wallet can be read
 * even when the user has not signed in to a Maze identity session.
 */
export function HeaderCoinBalance() {
  const { isAuthenticated, user } = useIdentity();
  const [walletSnapshot, setWalletSnapshot] = useState<WalletSnapshot>({
    address: undefined,
    isConnected: false,
    status: undefined,
  });
  const [Runtime, setRuntime] = useState<{ Component: RuntimeComponent } | null>(null);
  const [amount, setAmount] = useState<string | null>(null);
  const [symbol, setSymbol] = useState('COIN');
  const [balanceState, setBalanceState] = useState<BalanceState>('idle');

  const handleWalletSnapshot = useCallback((next: WalletSnapshot) => {
    setWalletSnapshot(next);
  }, []);
  const ignoreRuntimeCallback = useCallback(() => undefined, []);

  useEffect(() => {
    const handlePublishedSnapshot = (event: Event) => {
      const snapshot = (event as CustomEvent<WalletSnapshot>).detail;
      if (!snapshot || typeof snapshot !== 'object') return;
      setWalletSnapshot(snapshot);
    };

    window.addEventListener('maze:wallet-snapshot', handlePublishedSnapshot);

    if (!walletConfigured) {
      return () => window.removeEventListener('maze:wallet-snapshot', handlePublishedSnapshot);
    }

    let cancelled = false;
    const startRuntime = () => {
      void import('../../platform/wallet/WalletConnectRuntime')
        .then((module) => {
          if (!cancelled) setRuntime({ Component: module.WalletRuntime });
        })
        .catch((error: unknown) => {
          console.warn('[wallet] header balance could not restore the wallet account:', error);
        });
    };

    let cancelIdle: (() => void) | undefined;
    if (typeof window.requestIdleCallback === 'function') {
      const idleId = window.requestIdleCallback(startRuntime, { timeout: 4000 });
      cancelIdle = () => window.cancelIdleCallback(idleId);
    } else {
      const timerId = window.setTimeout(startRuntime, 1500);
      cancelIdle = () => window.clearTimeout(timerId);
    }

    return () => {
      cancelled = true;
      cancelIdle?.();
      window.removeEventListener('maze:wallet-snapshot', handlePublishedSnapshot);
    };
  }, []);

  const authenticatedAddress = isAuthenticated ? user?.walletAddress : undefined;
  const connectedAddress = walletSnapshot.isConnected ? walletSnapshot.address : undefined;
  const addressMismatch = Boolean(
    authenticatedAddress && connectedAddress && authenticatedAddress !== connectedAddress,
  );
  const ownerAddress = addressMismatch ? undefined : authenticatedAddress || connectedAddress;

  useEffect(() => {
    if (!ownerAddress) {
      setAmount(null);
      setBalanceState('idle');
      setSymbol('COIN');
      return undefined;
    }

    let disposed = false;
    let inFlight = false;
    const controller = new AbortController();

    const refreshBalance = async () => {
      if (disposed || inFlight || document.visibilityState === 'hidden') return;
      inFlight = true;
      setBalanceState((current) => current === 'ready' ? 'ready' : 'loading');

      try {
        const response = await fetch(
          `${API_PATHS.tokenBalance}?owner=${encodeURIComponent(ownerAddress)}`,
          {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'no-store',
            signal: controller.signal,
            headers: { Accept: 'application/json' },
          },
        );
        const payload = await response.json() as Partial<TokenBalanceResponse> & { error?: string };
        if (!response.ok || payload.ok !== true || typeof payload.amount !== 'string') {
          throw new Error(payload.error || `Token balance request failed (${response.status}).`);
        }
        if (disposed) return;
        setAmount(payload.amount);
        setSymbol(typeof payload.symbol === 'string' && payload.symbol.trim() ? payload.symbol.trim() : 'COIN');
        setBalanceState('ready');
      } catch (error) {
        if (disposed || (error instanceof Error && error.name === 'AbortError')) return;
        setBalanceState('error');
      } finally {
        inFlight = false;
      }
    };

    void refreshBalance();
    const intervalId = window.setInterval(() => { void refreshBalance(); }, BALANCE_REFRESH_MS);
    const handleVisibility = () => { if (document.visibilityState === 'visible') void refreshBalance(); };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      disposed = true;
      controller.abort();
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [ownerAddress]);

  const displayedAmount = amount === null
    ? ownerAddress ? (balanceState === 'loading' ? '…' : '—') : '—'
    : formatHeaderAmount(amount);

  return (
    <div
      className="site-header-coin-balance"
      data-balance-state={balanceState}
      aria-label={ownerAddress ? `${displayedAmount} ${symbol} wallet balance` : 'Connect a wallet to view token balance'}
      title={ownerAddress ? `${amount ?? 'Loading'} ${symbol}` : 'Connect a Solana wallet to view your token balance'}
      aria-live="polite"
    >
      <span className="site-header-coin-amount">{displayedAmount}</span>
      <span className="site-header-coin-symbol">{symbol}</span>
      {Runtime ? (
        <Runtime.Component
          onSnapshot={handleWalletSnapshot}
          onReady={ignoreRuntimeCallback}
          onModalOpenChange={ignoreRuntimeCallback}
          onDisconnectReady={ignoreRuntimeCallback}
          onSignInReady={ignoreRuntimeCallback}
          onSignMessageReady={ignoreRuntimeCallback}
          onSigningStatusChange={ignoreRuntimeCallback}
        />
      ) : null}
    </div>
  );
}
