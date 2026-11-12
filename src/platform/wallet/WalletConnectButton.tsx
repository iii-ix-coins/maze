import { lazy, Suspense, useState } from 'react';

const WalletRuntime = lazy(() => import('./WalletConnectRuntime').then((module) => ({ default: module.WalletConnectRuntime })));

export function WalletConnectButton() {
  const [requested, setRequested] = useState(false);
  const [configured] = useState(() => String(import.meta.env.VITE_REOWN_PROJECT_ID ?? '').trim().length > 0);
  if (!configured) {
    return <button className="nav-wallet-button" type="button" data-nav-action="connect-wallet" disabled title="Set VITE_REOWN_PROJECT_ID in the build environment to enable wallet connections." aria-label="Wallet connection is not configured"><span>Connect Wallet</span></button>;
  }
  if (!requested) {
    return <button className="nav-wallet-button" type="button" data-nav-action="connect-wallet" onClick={() => setRequested(true)}><span>Connect Wallet</span></button>;
  }
  return <Suspense fallback={<button className="nav-wallet-button" type="button" disabled>Loading wallet…</button>}><WalletRuntime /></Suspense>;
}
