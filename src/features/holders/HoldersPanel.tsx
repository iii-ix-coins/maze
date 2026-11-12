import { memo, useMemo, type CSSProperties } from 'react';
import { formatInteger } from '../../services/formatters';
import { useHolders, type HolderItem } from './useHolders';

function shortWallet(wallet: unknown): string {
  if (!wallet || typeof wallet !== 'string') return '--';
  if (wallet.length < 12) return wallet;
  return `${wallet.slice(0, 5)}...${wallet.slice(-5)}`;
}

function formatHolderAmount(value: unknown): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '--';
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(2)}B`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(2)}K`;
  return amount.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function formatRelativeTime(blockTime: unknown): string {
  if (blockTime == null) return 'Never';
  const secondsValue = Number(blockTime);
  if (!Number.isFinite(secondsValue)) return '--';
  const difference = Date.now() - secondsValue * 1000;
  if (difference < 0) return 'Just now';
  const seconds = Math.floor(difference / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function walletHue(wallet: string): number {
  let hash = 0;
  for (let index = 0; index < wallet.length; index += 1) {
    hash = (Math.imul(hash, 31) + wallet.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % 360;
}

function holderHeat(amount: unknown, min: number, max: number): string {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0 || max <= 0) return '0';
  const span = max > min ? Math.log(max) - Math.log(min) : 0;
  const heat = span > 0 ? (Math.log(value) - Math.log(min)) / span : 1;
  return (0.04 + heat * 0.96).toFixed(3);
}

const HolderRow = memo(function HolderRow({ holder, minAmount, maxAmount }: { holder: HolderItem; minAmount: number; maxAmount: number }) {
  const wallet = typeof holder.wallet === 'string' ? holder.wallet : '';
  const style = {
    '--heat': holderHeat(holder.uiAmount, minAmount, maxAmount),
    '--hue': walletHue(wallet),
  } as CSSProperties;
  const purchases = Number(holder.purchases);
  return (
    <div className="holders-row holder-row" data-wallet={wallet} style={style} key={wallet}>
      <div className="holder-rank"><span className="holder-rank-value">{holder.rank ?? '--'}</span></div>
      <div className="holder-wallet"><span className="wallet-address" title={wallet}>{shortWallet(wallet)}</span></div>
      <div className="holder-amount"><span className="holder-amount-value">{formatHolderAmount(holder.uiAmount)}</span></div>
      <div className="holder-Purchases"><span className="holder-purchases-value">{Number.isFinite(purchases) ? purchases.toLocaleString('en-US') : '0'}</span></div>
      <div className="holder-last-Purchases"><span className="holder-last-Purchases-value">{formatRelativeTime(holder.lastPurchaseBlockTime)}</span></div>
    </div>
  );
});

export function HoldersPanel({ fullPage = false }: { fullPage?: boolean }) {
  const { items, totalHolders, status } = useHolders();
  const bounds = useMemo(() => {
    const values = items.map((item) => Number(item.uiAmount)).filter((value) => Number.isFinite(value) && value > 0);
    return { minAmount: values.length ? Math.min(...values) : 0, maxAmount: values.length ? Math.max(...values) : 0 };
  }, [items]);
  return (
    <section className={`holders-box${fullPage ? ' holders-box--page' : ''}`} aria-label="Token holders">
      <div className="holders-header">
        <div className="holders-title">
          <span>Holders</span>
          <span id="holders-count" className="holders-count">
            {status === 'loading' ? 'Loading…' : formatInteger(totalHolders)}
          </span>
        </div>
        <div className="holders-header-actions">
          {!fullPage ? <a className="feature-text-link" href="/holders.html">View all <span aria-hidden="true">→</span></a> : null}
          <span className="feature-refresh-state">Top 100 · refreshes every 5s</span>
        </div>
      </div>
      <div className="holders-content">
        <div className="holders-columns" aria-hidden="true">
          <span>#</span><span>Wallet</span><span>Holding</span><span>Buys</span><span>Last buy</span>
        </div>
        <div id="holders-list" className="holders-list">
          {status === 'loading' ? <div className="holders-status holders-status-loading">Loading holders…</div> : null}
          {status === 'error' ? <div className="holders-status holders-status-error">Unable to load holder data.</div> : null}
          {status === 'empty' ? <div className="holders-status holders-status-empty">No holder data available.</div> : null}
          {status === 'ready' ? items.map((holder) => <HolderRow key={String(holder.wallet)} holder={holder} minAmount={bounds.minAmount} maxAmount={bounds.maxAmount} />) : null}
        </div>
      </div>
    </section>
  );
}
