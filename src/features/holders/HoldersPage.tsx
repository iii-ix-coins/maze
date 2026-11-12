import '../../styles/feature-pages.css';
import { HoldersPanel } from './HoldersPanel';

export function HoldersPage() {
  return (
    <main className="feature-page-shell holders-page">
      <header className="feature-page-title">
        <span className="eyebrow">On-chain distribution</span>
        <h1>Top Token Holders</h1>
        <p>Wallet balances and recent purchase activity from the existing holders feed.</p>
      </header>
      <HoldersPanel fullPage />
    </main>
  );
}
