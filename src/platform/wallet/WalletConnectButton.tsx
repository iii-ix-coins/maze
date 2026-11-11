import { useEffect } from 'react';
import {
  useAppKit,
  useAppKitAccount,
  useAppKitTheme,
} from '@reown/appkit/react';
import { useSiteTheme } from '../../hooks/useSiteTheme';
import { isWalletConnectionConfigured } from './appkit';

function shortenAddress(address: string | undefined): string {
  if (!address) return 'Wallet Connected';
  if (address.length <= 14) return address;
  return `${address.slice(0, 5)}…${address.slice(-5)}`;
}

/** Keeps the third-party wallet picker visually aligned with Maze's theme. */
function ConnectedWalletButton() {
  const { open } = useAppKit();
  const { address, isConnected, status } = useAppKitAccount({
    namespace: 'solana',
  });
  const { setThemeMode, setThemeVariables } = useAppKitTheme();
  const theme = useSiteTheme();

  useEffect(() => {
    setThemeMode(theme === 'light' ? 'light' : 'dark');
    setThemeVariables({
      '--apkt-color-mix': theme === 'grass' ? '#70e000' : '#78edc0',
      '--apkt-color-mix-strength': 42,
    });
  }, [theme, setThemeMode, setThemeVariables]);

  const isBusy = status === 'connecting' || status === 'reconnecting';

  const handleClick = () => {
    void open(
      isConnected
        ? { view: 'Account' }
        : { view: 'Connect', namespace: 'solana' },
    );
  };

  return (
    <button
      className={`nav-wallet-button${isConnected ? ' is-connected' : ''}`}
      type="button"
      data-nav-action="connect-wallet"
      data-wallet-status={status ?? 'disconnected'}
      aria-label={
        isConnected
          ? `Wallet ${address ?? ''}. Open wallet options`
          : 'Connect Solana wallet'
      }
      aria-busy={isBusy}
      onClick={handleClick}
    >
      {isConnected ? (
        <>
          <span className="nav-wallet-indicator" aria-hidden="true" />
          <span className="nav-wallet-address">{shortenAddress(address)}</span>
        </>
      ) : (
        <span>{isBusy ? 'Connecting…' : 'Connect Wallet'}</span>
      )}
    </button>
  );
}

/**
 * AppKit needs a Reown Project ID for WalletConnect discovery. Do not silently
 * pretend to connect when the deployment has not been configured.
 */
export function WalletConnectButton() {
  if (!isWalletConnectionConfigured) {
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

  return <ConnectedWalletButton />;
}
