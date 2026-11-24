import { getMarketToken, type MarketPayload } from './market-types';
import { useMarketData } from './useMarketData';
import { useLivePrice } from './useLivePrice';
import { formatInteger, formatTokenPrice, formatUsd } from '../../services/formatters';
import { ThemedSvgIcon } from '../../components/media/ThemedSvgIcon';

interface MarketSummaryProps {
  showTitle?: boolean;
  compact?: boolean;
}

function formatScore(value: unknown): string {
  const score = Number(value);
  return Number.isFinite(score) ? score.toFixed(2) : '--';
}

function formatPercentChange(value: number | null): string {
  if (value === null) return '24H change unavailable';
  const sign = value > 0 ? '+' : '';
  return `24H ${sign}${value.toFixed(2)}%`;
}

function TokenSummaryContent({
  payload,
  error,
}: {
  payload: MarketPayload | null;
  error: string | null;
}) {
  const token = getMarketToken(payload);
  const stats24h = token?.stats24h;
  const volume24h = (Number(stats24h?.buyVolume) || 0) + (Number(stats24h?.sellVolume) || 0);
  const livePrice = useLivePrice();
  const price = livePrice.snapshot;
  const priceDirection = price?.change24h === null || price?.change24h === undefined
    ? 'neutral'
    : price.change24h >= 0 ? 'positive' : 'negative';
  const priceIsStale = Boolean(price?.updatedAt && Date.now() - price.updatedAt > 15_000);
  const priceTitle = price?.updatedAt
    ? `PCLQCH live price · Updated ${new Date(price.updatedAt).toLocaleTimeString()}${priceIsStale ? ' · Engine update delayed' : ''}`
    : 'Live price provided by PCLQCH engine';

  return (
    <>
      {/* MAIN SUMMARY CARD */}
      <section
        className="token-summary"
        aria-label="Token market summary"
      >
        {/* TOKEN IMAGE + PRICE */}
        <div className="token-summary-visual">
          <ThemedSvgIcon
            className="token-summary-icon"
            src="/css/images/maze-coin-logo.svg"
            label={`${token?.name || 'Token'} logo`}
          />

          <div
            className="token-summary-item token-summary-item--price"
            data-direction={priceDirection}
            data-stale={priceIsStale || Boolean(livePrice.error)}
            title={priceTitle}
          >
            <strong data-market="price" aria-live="off">
              {price ? formatTokenPrice(price.priceUsd) : '$0.0'}
            </strong>
          </div>
        </div>

        {/* MARKET METRICS */}
        <div className="token-summary-main">
          <div className="token-summary-grid">

            <div className="token-summary-item">
              <span>Market Cap</span>
              <strong data-market="mcap">
                {token ? formatUsd(token.mcap) : '--'}
              </strong>
            </div>

            <div className="token-summary-item">
              <span>Liquidity</span>
              <strong data-market="liquidity">
                {token ? formatUsd(token.liquidity) : '--'}
              </strong>
            </div>

            <div className="token-summary-item">
              <span>24h Volume</span>
              <strong data-market="volume24h">
                {token ? formatUsd(volume24h) : '--'}
              </strong>
            </div>


            <div className="token-summary-item">
              <span>Organic Score</span>
              <strong data-market="organic">
                {token ? formatScore(token.organicScore) : '--'}
              </strong>
            </div>

            <div className="token-summary-item">
              <span>Net Buyers</span>
              <strong data-market="netBuyers">
                {token ? formatInteger(stats24h?.numNetBuyers) : '--'}
              </strong>
            </div>

          </div>
        </div>
      </section>

      {/* ERROR MESSAGE — OUTSIDE GRID */}
      {error && !token ? (
        <p
          className="feature-status feature-status--error"
          role="status"
        >
          {error}
        </p>
      ) : null}
    </>
  );
}

export function MarketSummary({ showTitle = true, compact = false }: MarketSummaryProps) {
  const { payload, loading, error } = useMarketData();
  return (
    <section className={`feature-section market-feature${compact ? ' market-feature--compact' : ''}`} aria-label="market summary">
      {showTitle ? (
        <header className="feature-section-heading feature-section-heading--status-only">
          <span className="feature-refresh-state" aria-live="polite">{loading && !payload ? 'Loading market…' : error && !payload ? 'Unavailable' : 'Auto-updating'}</span>
        </header>
      ) : null}
      <TokenSummaryContent payload={payload} error={error} />
    </section>
  );
}
