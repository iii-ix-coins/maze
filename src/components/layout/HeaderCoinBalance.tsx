
import {
  useCallback,
  useEffect,
  useState,
  type ComponentType,
} from 'react';

import { API_PATHS } from '../../services/api/contracts';
import { useIdentity } from '../../platform/identity/IdentityProvider';
import { ThemedSvgIcon } from '../media/ThemedSvgIcon';

import type {
  WalletRuntimeProps,
  WalletSnapshot,
} from '../../platform/wallet/WalletConnectRuntime';

type BalanceState = 'idle' | 'loading' | 'ready' | 'error';
type CopyState = 'idle' | 'copied' | 'error';

type TokenBalanceResponse = {
  ok: true;
  owner: string;
  mintAddress: string;
  amount: string;
  decimals: number;
  tokenAccounts: number;
  slot: number | null;
  updatedAt: number;
};

type RuntimeComponent = ComponentType<WalletRuntimeProps>;

const walletConfigured =
  String(import.meta.env.VITE_REOWN_PROJECT_ID ?? '').trim().length > 0;

const BALANCE_REFRESH_MS = 30_000;

function formatHeaderAmount(value: string): string {
  if (!/^\d+(?:\.\d+)?$/.test(value)) return '—';

  const amount = Number(value);

  if (!Number.isFinite(amount)) return '—';

  const formatted = new Intl.NumberFormat('en-US', {
    notation: 'compact',
    compactDisplay: 'short',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);

  return formatted.replace(
    /([KMBT])$/,
    (_, suffix: string) => suffix.toLowerCase(),
  );
}

export function HeaderCoinBalance() {
  const { isAuthenticated, user } = useIdentity();

  const [walletSnapshot, setWalletSnapshot] =
    useState<WalletSnapshot>({
      address: undefined,
      isConnected: false,
      status: undefined,
    });

  const [Runtime, setRuntime] =
    useState<{ Component: RuntimeComponent } | null>(null);

  const [amount, setAmount] = useState<string | null>(null);
  const [mintAddress, setMintAddress] = useState<string | null>(null);

  const [balanceState, setBalanceState] =
    useState<BalanceState>('idle');

  const [copyState, setCopyState] =
    useState<CopyState>('idle');

  const handleWalletSnapshot = useCallback(
    (next: WalletSnapshot) => {
      setWalletSnapshot(next);
    },
    [],
  );

  const ignoreRuntimeCallback = useCallback(
    () => undefined,
    [],
  );

  // Wallet snapshot and runtime initialization
  useEffect(() => {
    const handlePublishedSnapshot = (event: Event) => {
      const snapshot =
        (event as CustomEvent<WalletSnapshot>).detail;

      if (!snapshot || typeof snapshot !== 'object') return;

      setWalletSnapshot(snapshot);
    };

    window.addEventListener(
      'maze:wallet-snapshot',
      handlePublishedSnapshot,
    );

    if (!walletConfigured) {
      return () => {
        window.removeEventListener(
          'maze:wallet-snapshot',
          handlePublishedSnapshot,
        );
      };
    }

    let cancelled = false;

    const startRuntime = () => {
      void import('../../platform/wallet/WalletConnectRuntime')
        .then((module) => {
          if (!cancelled) {
            setRuntime({
              Component: module.WalletRuntime,
            });
          }
        })
        .catch((error: unknown) => {
          console.warn(
            '[wallet] header balance runtime initialization failed:',
            error,
          );
        });
    };

    let cancelIdle: (() => void) | undefined;

    if (typeof window.requestIdleCallback === 'function') {
      const idleId = window.requestIdleCallback(
        startRuntime,
        { timeout: 4000 },
      );

      cancelIdle = () => window.cancelIdleCallback(idleId);
    } else {
      const timerId = window.setTimeout(startRuntime, 1500);

      cancelIdle = () => window.clearTimeout(timerId);
    }

    return () => {
      cancelled = true;
      cancelIdle?.();

      window.removeEventListener(
        'maze:wallet-snapshot',
        handlePublishedSnapshot,
      );
    };
  }, []);

  // Determine current wallet owner
  const authenticatedAddress =
    isAuthenticated ? user?.walletAddress : undefined;

  const connectedAddress =
    walletSnapshot.isConnected
      ? walletSnapshot.address
      : undefined;

  const addressMismatch = Boolean(
    authenticatedAddress &&
    connectedAddress &&
    authenticatedAddress !== connectedAddress,
  );

  const ownerAddress = addressMismatch
    ? undefined
    : authenticatedAddress || connectedAddress;

  // Fetch token balance
  useEffect(() => {
    if (!ownerAddress) {
      setAmount(null);
      setMintAddress(null);
      setBalanceState('idle');
      setCopyState('idle');

      return undefined;
    }

    let disposed = false;
    let inFlight = false;

    const controller = new AbortController();

    const refreshBalance = async () => {
      if (
        disposed ||
        inFlight ||
        document.visibilityState === 'hidden'
      ) {
        return;
      }

      inFlight = true;

      setBalanceState((current) =>
        current === 'ready' ? 'ready' : 'loading',
      );

      try {
        const response = await fetch(
          `${API_PATHS.tokenBalance}?owner=${encodeURIComponent(ownerAddress)}`,
          {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'no-store',
            signal: controller.signal,
            headers: {
              Accept: 'application/json',
            },
          },
        );

        const payload =
          await response.json() as Partial<TokenBalanceResponse> & {
            error?: string;
          };

        if (
          !response.ok ||
          payload.ok !== true ||
          typeof payload.amount !== 'string' ||
          typeof payload.mintAddress !== 'string'
        ) {
          throw new Error(
            payload.error ||
            `Token balance request failed (${response.status}).`,
          );
        }

        if (disposed) return;

        setAmount(payload.amount);
        setMintAddress(payload.mintAddress);
        setBalanceState('ready');
        setCopyState('idle');
      } catch (error) {
        if (
          disposed ||
          (error instanceof Error && error.name === 'AbortError')
        ) {
          return;
        }

        setBalanceState('error');
      } finally {
        inFlight = false;
      }
    };

    void refreshBalance();

    const intervalId = window.setInterval(
      () => {
        void refreshBalance();
      },
      BALANCE_REFRESH_MS,
    );

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refreshBalance();
      }
    };

    document.addEventListener(
      'visibilitychange',
      handleVisibility,
    );

    return () => {
      disposed = true;

      controller.abort();

      window.clearInterval(intervalId);

      document.removeEventListener(
        'visibilitychange',
        handleVisibility,
      );
    };
  }, [ownerAddress]);

  // Copy Mint address on button click
  const handleCoinButtonClick = useCallback(async () => {
    if (!mintAddress) return;

    try {
      await navigator.clipboard.writeText(mintAddress);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
  }, [mintAddress]);

  const displayedAmount =
    amount === null
      ? ownerAddress
        ? balanceState === 'loading' ? '…' : '—'
        : '—'
      : formatHeaderAmount(amount);

  const buttonTitle =
    copyState === 'copied'
      ? 'Mint address copied'
      : copyState === 'error'
        ? 'Could not copy Mint address'
        : 'Copy token Mint address';

  return (
    <div
      className="site-header-coin-balance"
      data-balance-state={balanceState}
    >
      <button
        type="button"
        className="site-header-coin-button"
        onClick={handleCoinButtonClick}
        disabled={!mintAddress}
        aria-label={`Copy token Mint address. Balance: ${displayedAmount}`}
        title={buttonTitle}
      >
        <ThemedSvgIcon
          className="site-header-coin-image"
          src="/css/images/amount-logo.svg"
          tone="tile"
        />

        <span
          className="site-header-coin-amount"
          aria-live="polite"
        >
          {displayedAmount}
        </span>
      </button>

      {/* Keep Wallet Runtime outside the clickable button */}
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
