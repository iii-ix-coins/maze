import { getMarketToken, type MarketPayload } from './market-types';
import { useMarketData } from './useMarketData';
import { formatInteger, formatUsd } from '../../services/formatters';

interface MarketSummaryProps {
  showTitle?: boolean;
  compact?: boolean;
}

function formatScore(value: unknown): string {
  const score = Number(value);
  return Number.isFinite(score) ? score.toFixed(2) : '--';
}

function TokenSummaryContent({ payload, error }: { payload: MarketPayload | null; error: string | null }) {
  const token = getMarketToken(payload);
  const stats24h = token?.stats24h;
  const volume24h = (Number(stats24h?.buyVolume) || 0) + (Number(stats24h?.sellVolume) || 0);
  const icon = String(token?.icon ?? '').trim().replace(/^https?:\/\//i, (match) => match.toLowerCase());

  return (
    <section className="token-summary" aria-label="Token market summary">
      <div className="token-summary-header">
        <div className="token-summary-identity">
          <img
            id="token-summary-icon"
            className="token-summary-icon"
            src={icon || '/css/images/hollld-logo.svg'}
            alt="Token"
            loading="lazy"
            onError={(event) => { event.currentTarget.src = '/css/images/hollld-logo.svg'; }}
          />
          <div className="token-summary-name">
            <div id="token-summary-name" className="token-summary-title">{token?.name || '--'}</div>
            <div id="token-summary-symbol" className="token-summary-symbol">{token?.symbol ? `$${token.symbol}` : '--'}</div>
          </div>
          <span id="token-summary-verified" className="token-summary-badge" hidden={token?.isVerified !== true}>Verified</span>
        </div>
        <a href="/coin.html" className="token-summary-link">Token details <span aria-hidden="true">→</span></a>
      </div>

      <div className="token-summary-grid">
        <div className="token-summary-item"><span>Market Cap</span><strong data-market="mcap">{token ? formatUsd(token.mcap) : '--'}</strong></div>
        <div className="token-summary-item"><span>Liquidity</span><strong data-market="liquidity">{token ? formatUsd(token.liquidity) : '--'}</strong></div>
        <div className="token-summary-item"><span>24h Volume</span><strong data-market="volume24h">{token ? formatUsd(volume24h) : '--'}</strong></div>
        <div className="token-summary-item"><span>Holders</span><strong data-market="holders">{token ? formatInteger(token.holderCount) : '--'}</strong></div>
        <div className="token-summary-item"><span>Organic Score</span><strong data-market="organic">{token ? formatScore(token.organicScore) : '--'}</strong></div>
        <div className="token-summary-item"><span>Net Buyers</span><strong data-market="netBuyers">{token ? formatInteger(stats24h?.numNetBuyers) : '--'}</strong></div>
      </div>
      {error && !token ? <p className="feature-status feature-status--error" role="status">{error}</p> : null}
    </section>
  );
}

export function MarketSummary({ showTitle = true, compact = false }: MarketSummaryProps) {
  const { payload, loading, error } = useMarketData();
  return (
    <section className={`feature-section market-feature${compact ? ' market-feature--compact' : ''}`} aria-labelledby="market-summary-heading">
      {showTitle ? (
        <header className="feature-section-heading">
          <div><span className="eyebrow">Live market</span><h2 id="market-summary-heading">Market overview</h2></div>
          <span className="feature-refresh-state" aria-live="polite">{loading && !payload ? 'Loading market…' : error && !payload ? 'Unavailable' : 'Auto-updating'}</span>
        </header>
      ) : null}
      <TokenSummaryContent payload={payload} error={error} />
    </section>
  );
}
