import './appkit';
import { useEffect } from 'react';
import { useAppKit, useAppKitAccount, useAppKitTheme } from '@reown/appkit/react';
import { useSiteTheme } from '../../hooks/useSiteTheme';

function shortenAddress(address: string | undefined): string {
  if (!address) return 'Wallet Connected';
  return address.length <= 14 ? address : `${address.slice(0, 5)}…${address.slice(-5)}`;
}

export function WalletRuntime() {
  const { open } = useAppKit();
  const { address, isConnected, status } = useAppKitAccount({ namespace: 'solana' });
  const { setThemeMode, setThemeVariables } = useAppKitTheme();
  const theme = useSiteTheme();
  useEffect(() => {
    setThemeMode(theme === 'light' ? 'light' : 'dark');
    setThemeVariables({ '--apkt-color-mix': theme === 'grass' ? '#70e000' : '#78edc0', '--apkt-color-mix-strength': 42 });
  }, [theme, setThemeMode, setThemeVariables]);
  const isBusy = status === 'connecting' || status === 'reconnecting';
  return <button className={`nav-wallet-button${isConnected ? ' is-connected' : ''}`} type="button" data-nav-action="connect-wallet" data-wallet-status={status ?? 'disconnected'} aria-label={isConnected ? `Wallet ${address ?? ''}. Open wallet options` : 'Connect Solana wallet'} aria-busy={isBusy} onClick={() => void open(isConnected ? { view: 'Account' } : { view: 'Connect', namespace: 'solana' })}>{isConnected ? <><span className="nav-wallet-indicator" aria-hidden="true" /><span className="nav-wallet-address">{shortenAddress(address)}</span></> : <span>{isBusy ? 'Connecting…' : 'Connect Wallet'}</span>}</button>;
}
