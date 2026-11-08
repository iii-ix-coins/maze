import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { formatAmount, formatInteger, formatUsd } from '../../services/formatters';
import { getMarketEnvelope, getMarketToken, type MarketPayload, type UnknownRecord } from '../market/market-types';
import { useMarketData } from '../market/useMarketData';

type SparkPoint = { t: number; price: number };
const PERIODS = ['5m', '1h', '6h', '24h'] as const;

function formatTokenPrice(value: unknown): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return '--';
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 8,
  }).format(number);
}

function formatPercent(value: unknown): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return '--';
  return `${number >= 0 ? '+' : ''}${number.toFixed(2)}%`;
}

function normalizeUrl(value: unknown): string {
  let text = String(value ?? '').trim();
  if (!text) return '';
  const markdownMatch = text.match(/^\[.*?\]\((https?:\/\/.*?)\)$/);
  if (markdownMatch) text = markdownMatch[1];
  if (!/^https?:\/\//i.test(text)) text = `https://${text}`;
  return text;
}

function getVolume(stats: UnknownRecord | undefined): number {
  return (Number(stats?.buyVolume) || 0) + (Number(stats?.sellVolume) || 0);
}

function spanLabel(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 90) return `${minutes}m`;
  const hours = minutes / 60;
  return hours < 48 ? `${hours.toFixed(hours < 10 ? 1 : 0)}h` : `${Math.round(hours / 24)}d`;
}

function useMarketHistory(): { points: SparkPoint[]; change: number | null } {
  const [points, setPoints] = useState<SparkPoint[]>([]);
  useEffect(() => {
    let active = true;
    let controller: AbortController | null = null;
    const load = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch('/api/jupiter-market/history?limit=240', {
          method: 'GET', cache: 'no-store', signal: controller.signal,
        });
        if (!response.ok) throw new Error(`History request failed: ${response.status}`);
        const payload = await response.json() as { items?: UnknownRecord[] };
        if (!active) return;
        const next = (Array.isArray(payload?.items) ? payload.items : [])
          .map((item) => ({
            t: Number(item?.fetchedAtMs),
            price: Number(item?.data?.priceV3?.usdPrice ?? item?.data?.tokenV2?.usdPrice),
          }))
          .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.price) && point.price > 0)
          .sort((a, b) => a.t - b.t);
        setPoints(next.length >= 3 ? next : []);
      } catch (error) {
        if ((error as { name?: string })?.name !== 'AbortError') {
          // The chart is decorative; preserve its last successful snapshot on failures.
        }
      }
    };
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
      controller?.abort();
    };
  }, []);

  const change = points.length >= 3
    ? ((points[points.length - 1].price - points[0].price) / points[0].price) * 100
    : null;
  return { points, change };
}

function PriceSparkline({ points, change }: { points: SparkPoint[]; change: number | null }) {
  const width = 320;
  const height = 110;
  const pad = 6;
  const geometry = useMemo(() => {
    if (points.length < 3) return null;
    const prices = points.map((point) => point.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || max * 0.002 || 1;
    const t0 = points[0].t;
    const dt = points[points.length - 1].t - t0 || 1;
    const xy = points.map((point) => [
      pad + ((point.t - t0) / dt) * (width - 2 * pad),
      pad + (1 - (point.price - min) / range) * (height - 2 * pad),
    ]);
    const line = xy.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
    const area = `${line}L${xy[xy.length - 1][0].toFixed(1)} ${height}L${xy[0][0].toFixed(1)} ${height}Z`;
    return { line, area, last: xy[xy.length - 1], duration: spanLabel(dt) };
  }, [points]);

  if (!geometry || change === null) return null;
  return (
    <div id="coin-sparkline" className="coin-sparkline" data-trend={change >= 0 ? 'up' : 'down'}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`Price over the last ${geometry.duration}: ${change >= 0 ? 'up' : 'down'} ${Math.abs(change).toFixed(2)} percent`}>
        <defs><linearGradient id="coin-spark-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity="0.34"/><stop offset="1" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs>
        <path className="spark-area" d={geometry.area} fill="url(#coin-spark-fill)" />
        <path className="spark-line" d={geometry.line} pathLength="1" />
      </svg>
      <i className="spark-dot" style={{ left: `${(geometry.last[0] / width * 100).toFixed(2)}%`, top: `${(geometry.last[1] / height * 100).toFixed(2)}%` }} />
      <span className="spark-caption">{geometry.duration} · {change >= 0 ? '+' : '−'}{Math.abs(change).toFixed(2)}%</span>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div className="coin-metric"><span>{label}</span><strong data-tone={tone}>{value}</strong></div>;
}

function PeriodCard({ label, stats }: { label: string; stats: UnknownRecord | undefined }) {
  const change = Number(stats?.priceChange);
  const direction = Number.isFinite(change) ? change >= 0 ? 'gain' : 'loss' : undefined;
  return (
    <article className="coin-period-card" data-direction={direction}>
      <div className="coin-period-head"><span>{label}</span><strong>{formatPercent(stats?.priceChange)}</strong></div>
      <div className="coin-period-row"><span>Volume</span><strong>{formatUsd(getVolume(stats))}</strong></div>
      <div className="coin-period-row"><span>Volume Δ</span><strong>{formatPercent(stats?.volumeChange)}</strong></div>
      <div className="coin-period-row"><span>Liquidity Δ</span><strong>{formatPercent(stats?.liquidityChange)}</strong></div>
      <div className="coin-period-row"><span>Holders Δ</span><strong>{formatPercent(stats?.holderChange)}</strong></div>
      <div className="coin-period-footer"><span>{formatInteger(stats?.numBuys)} buys</span><span>{formatInteger(stats?.numSells)} sells</span><span>{formatInteger(stats?.numTraders)} traders</span></div>
    </article>
  );
}

function AuditItem({ label, value, tone, meter }: { label: string; value: string; tone?: string; meter?: number }) {
  return (
    <div className="coin-audit-item" data-tone={tone}>
      <span>{label}</span><strong data-tone={tone}>{value}</strong>
      {meter !== undefined ? <i className="coin-meter" style={{ '--pct': Math.min(100, Math.max(0, meter)).toFixed(2) } as CSSProperties} /> : null}
    </div>
  );
}

function DetailsGrid({ rows, className }: { rows: Array<[string, string]>; className: string }) {
  return <div className={className}>{rows.map(([label, value]) => <div className="coin-project-item" key={label}><span>{label}</span><strong title={value}>{value}</strong></div>)}</div>;
}

function CoinContent({ payload, loading, error }: { payload: MarketPayload | null; loading: boolean; error: string | null }) {
  const market = getMarketEnvelope(payload);
  const token = getMarketToken(payload);
  const stats24h = token?.stats24h;
  const audit = token?.audit || {};
  const firstPool = token?.firstPool || {};
  const { points, change: sparkChange } = useMarketHistory();
  const score = Number(token?.organicScore);
  const scoreLevel = Number.isFinite(score) ? score >= 70 ? 'high' : score >= 40 ? 'mid' : 'low' : undefined;
  const buy = Number(stats24h?.buyVolume) || 0;
  const sell = Number(stats24h?.sellVolume) || 0;
  const totalFlow = buy + sell;
  const buyShare = totalFlow > 0 ? (buy / totalFlow) * 100 : 50;
  const lean = totalFlow <= 0 ? 'even' : buyShare >= 52 ? 'buy' : buyShare <= 48 ? 'sell' : 'even';
  const icon = String(token?.icon ?? '').trim().replace(/^https?:\/\//i, (match) => match.toLowerCase());
  const socials = [
    ['Website', token?.website], ['X', token?.twitter], ['Telegram', token?.telegram],
  ].map(([label, value]) => ({ label: String(label), href: normalizeUrl(value) })).filter((item) => item.href);

  const mintAuthorityDisabled = audit.mintAuthorityDisabled === true;
  const freezeAuthorityDisabled = audit.freezeAuthorityDisabled === true;
  const topHolders = Number(audit.topHoldersPercentage);
  const devBalance = Number(audit.devBalancePercentage);
  const meterTone = (value: number, warnAt: number, badAt: number) => !Number.isFinite(value) ? undefined : value >= badAt ? 'bad' : value >= warnAt ? 'warn' : undefined;

  return (
    <main className="coin-page feature-page-shell" aria-label="Coin information">
      <header className="feature-page-title"><span className="eyebrow">Token intelligence</span><h1>Token Market &amp; Details</h1><p>Market performance, on-chain activity and token security.</p></header>
      <section className="coin-hero">
        <div className="coin-identity">
          <img id="coin-icon" className="coin-icon" src={icon || '/css/images/hollld-logo.svg'} alt="Coin" onError={(event) => { event.currentTarget.src = '/css/images/hollld-logo.svg'; }} />
          <div className="coin-identity-text">
            <div className="coin-name-row"><h1 id="coin-name" className="coin-name">{token?.name || '--'}</h1><span id="coin-verified" className="coin-verified" hidden={token?.isVerified !== true}>Verified</span></div>
            <div id="coin-symbol" className="coin-symbol">{token?.symbol ? `$${token.symbol}` : '--'}</div>
            <span id="coin-launchpad" className="coin-launchpad">{token?.launchpad || 'Token'}</span>
          </div>
        </div>
        <div className="coin-score" id="coin-score" data-level={scoreLevel} style={{ '--score': Number.isFinite(score) ? Math.min(100, Math.max(0, score)).toFixed(2) : '0' } as CSSProperties} role="img" aria-label={Number.isFinite(score) ? `Organic score ${score.toFixed(2)} out of 100` : 'Organic score unavailable'}>
          <b id="coin-score-value">{Number.isFinite(score) ? String(Math.round(score)) : '--'}</b><span>Organic</span><i className="sr-only">{Number.isFinite(score) ? `Organic ${score.toFixed(2)}` : 'Organic --'}</i>
        </div>
      </section>

      <section className="coin-address-card"><div className="coin-address-label">Mint</div><code id="coin-mint" className="coin-address">{market.mintAddress || '--'}</code></section>

      <section className="coin-section">
        <div className="coin-section-title">Market Overview</div>
        <div className="coin-metric-grid">
          <div className="coin-metric coin-metric--price"><span>Price</span><strong id="coin-price">{token ? formatTokenPrice(token.usdPrice) : '--'}</strong><PriceSparkline points={points} change={sparkChange} /></div>
          <Metric label="24h" value={formatPercent(stats24h?.priceChange)} tone={Number(stats24h?.priceChange) >= 0 ? 'gain' : 'loss'} />
          <Metric label="Market Cap" value={token ? formatUsd(token.mcap) : '--'} />
          <Metric label="FDV" value={token ? formatUsd(token.fdv) : '--'} />
          <Metric label="Liquidity" value={token ? formatUsd(token.liquidity) : '--'} />
          <Metric label="Holders" value={token ? formatInteger(token.holderCount) : '--'} />
          <Metric label="Circulating" value={token ? formatAmount(token.circSupply) : '--'} />
          <Metric label="Total Supply" value={token ? formatAmount(token.totalSupply) : '--'} />
        </div>
      </section>

      <section className="coin-section">
        <div className="coin-section-title">Market Performance</div>
        <div id="coin-period-grid" className="coin-period-grid">{PERIODS.map((period) => <PeriodCard key={period} label={period} stats={token?.[`stats${period}`]} />)}</div>
      </section>

      <section className="coin-section">
        <div className="coin-section-title">24h Trading Flow</div>
        <div id="coin-flow-meter" className="coin-flow-meter" style={{ '--buy': buyShare.toFixed(2) } as CSSProperties} data-lean={lean}>
          <div className="coin-flow-meter-head"><span>Buy / Sell Pressure</span><b>{totalFlow <= 0 ? '--' : lean === 'buy' ? `Buyers lead · ${buyShare.toFixed(1)}%` : lean === 'sell' ? `Sellers lead · ${(100 - buyShare).toFixed(1)}%` : 'Balanced'}</b></div>
          <div className="coin-flow-meter-bar"><i className="coin-flow-meter-buy" /><i className="coin-flow-meter-sell" /></div>
          <div className="coin-flow-meter-labels"><span>Buy {totalFlow > 0 ? `${formatUsd(buy)} · ${buyShare.toFixed(1)}%` : '--'}</span><span>{totalFlow > 0 ? `${(100 - buyShare).toFixed(1)}% · ${formatUsd(sell)} Sell` : 'Sell --'}</span></div>
        </div>
        <div className="coin-flow-grid">
          <Metric label="Buy Volume" value={formatUsd(stats24h?.buyVolume)} /><Metric label="Sell Volume" value={formatUsd(stats24h?.sellVolume)} />
          <Metric label="Buys" value={formatInteger(stats24h?.numBuys)} /><Metric label="Sells" value={formatInteger(stats24h?.numSells)} />
          <Metric label="Traders" value={formatInteger(stats24h?.numTraders)} /><Metric label="Net Buyers" value={formatInteger(stats24h?.numNetBuyers)} />
        </div>
      </section>

      <section className="coin-section">
        <div className="coin-section-title">Audit &amp; Security</div>
        <div className="coin-audit-grid">
          <AuditItem label="Mint Authority" value={mintAuthorityDisabled ? 'Disabled' : 'Active'} tone={mintAuthorityDisabled ? 'good' : 'bad'} />
          <AuditItem label="Freeze Authority" value={freezeAuthorityDisabled ? 'Disabled' : 'Active'} tone={freezeAuthorityDisabled ? 'good' : 'bad'} />
          <AuditItem label="Top Holders" value={Number.isFinite(topHolders) ? `${topHolders.toFixed(2)}%` : '--'} tone={meterTone(topHolders, 35, 60)} meter={Number.isFinite(topHolders) ? topHolders : undefined} />
          <AuditItem label="Dev Balance" value={Number.isFinite(devBalance) ? `${devBalance.toFixed(8)}%` : '--'} tone={meterTone(devBalance, 5, 20)} meter={Number.isFinite(devBalance) ? devBalance : undefined} />
          <AuditItem label="Dev Migrations" value={formatInteger(audit.devMigrations)} />
          <AuditItem label="Dev Mints" value={formatInteger(audit.devMints)} />
        </div>
      </section>

      <section className="coin-section">
        <div className="coin-section-title">Project Information</div>
        <DetailsGrid className="coin-project-grid" rows={[
          ['Token Program', String(token?.tokenProgram || '--')], ['Launchpad', String(token?.launchpad || '--')],
          ['First Pool', String(firstPool.id || '--')], ['Graduated Pool', String(token?.graduatedPool || '--')],
          ['Created', String(token?.createdAt || '--')], ['Updated', String(token?.updatedAt || '--')],
        ]} />
      </section>

      <section className="coin-section">
        <div className="coin-section-title">Community</div>
        <div id="coin-socials" className="coin-socials">
          {socials.length ? socials.map((social) => <a key={social.label} className="coin-social-link" href={social.href} target="_blank" rel="noopener noreferrer">{social.label}</a>) : <span className="coin-social-empty">No public links available.</span>}
        </div>
      </section>

      <div id="coin-status" className="coin-status" data-status={error && !token ? 'error' : loading && !token ? 'loading' : 'ready'} role="status">
        {error && !token ? 'Market data temporarily unavailable.' : loading && !token ? 'Loading market data…' : payload?.updatedAt ? `Updated ${payload.updatedAt}` : 'Market data ready'}
      </div>
    </main>
  );
}

export function CoinPage() {
  const { payload, loading, error } = useMarketData(30_000);
  return <CoinContent payload={payload} loading={loading} error={error} />;
}
