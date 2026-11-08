import { MarketSummary } from './MarketSummary';

export function MarketPage() {
  return (
    <main className="feature-page-shell market-page">
      <header className="feature-page-title">
        <span className="eyebrow">Live market</span>
        <h1>Market</h1>
        <p>Real-time token market metrics from the existing Jupiter market service.</p>
      </header>
      <MarketSummary showTitle={false} />
      <p className="feature-page-footnote">Market data refreshes automatically every 30 seconds.</p>
    </main>
  );
}
