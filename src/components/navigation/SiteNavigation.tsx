import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { GameViewSwitcher } from './GameViewSwitcher';
import { WalletConnectButton } from '../../platform/wallet/WalletConnectButton';
import { ThemeSwitcher } from './ThemeSwitcher';
import { usePathname } from '../../app/navigation';
import { getSiteRoutePath, getSiteRoutePathByNavKey, normalizePath, resolveSiteRoute } from '../../app/routes';

type NavItem = {
  label: string;
  href: string;
  key: string;
  disabled?: boolean;
  title?: string;
  group?: 'compete';
};

const NAV_ITEMS: NavItem[] = [
  { label: 'Competitions', href: './competitions.html', key: 'competitions', group: 'compete', disabled: true, title: 'Competitions are coming soon.' },
  { label: 'Leaderboard', href: './leaderboard.html', key: 'leaderboard', group: 'compete', disabled: true, title: 'Leaderboard is coming soon.' },
  { label: 'Market', href: getSiteRoutePathByNavKey('market'), key: 'market' },
  { label: 'Token', href: getSiteRoutePathByNavKey('token'), key: 'token' },
  { label: 'Holders', href: getSiteRoutePathByNavKey('holders'), key: 'holders' },
  { label: 'How to Play', href: './how-to-play.html', key: 'how-to-play', disabled: true, title: 'How to Play Maze' },
];

function getCurrentPageKey(): string | null {
  const path = normalizePath(window.location.pathname);
  const routeKey = resolveSiteRoute(path)?.navKey;
  if (routeKey) return routeKey;
  if (path.endsWith('/competitions.html') || path.endsWith('/competitions')) return 'competitions';
  if (path.endsWith('/leaderboard.html') || path.endsWith('/leaderboard')) return 'leaderboard';
  if (path.endsWith('/how-to-play.html') || path.endsWith('/how-to-play')) return 'how-to-play';
  return null;
}

function NavItemLink({ item, onNavigate, dropdown = false }: { item: NavItem; onNavigate: () => void; dropdown?: boolean }) {
  const className = [
    'nav-link',
    dropdown ? 'nav-dropdown-link' : '',
    item.disabled ? 'nav-link-disabled' : '',
    item.key === getCurrentPageKey() ? 'active' : '',
  ].filter(Boolean).join(' ');

  if (item.disabled) {
    return <button className={className} type="button" disabled aria-disabled="true" title={item.title ?? 'Coming soon'} data-nav-key={item.key}>{item.label}</button>;
  }

  return (
    <a className={className} href={item.href} data-nav-key={item.key} aria-current={item.key === getCurrentPageKey() ? 'page' : undefined} onClick={onNavigate}>
      {item.label}
    </a>
  );
}

function CompeteMenu({ open, setOpen, onNavigate }: { open: boolean; setOpen: (open: boolean) => void; onNavigate: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const active = ['competitions', 'leaderboard'].includes(getCurrentPageKey() ?? '');

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={`nav-menu${open ? ' is-open' : ''}`}
      data-nav-menu="compete"
    >
      <button
        type="button"
        className={`nav-link nav-menu-trigger${active ? ' active' : ''}`}
        data-menu-trigger="compete"
        aria-expanded={open}
        aria-controls="maze-compete-menu"
        onClick={() => setOpen(!open)}
      >
        <span>Mazes</span>
        <svg className="nav-chevron" viewBox="0 -4 20 25" fill="none" aria-hidden="true">
          <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className="nav-dropdown" id="maze-compete-menu" hidden={!open} aria-label="Competition navigation">
        {NAV_ITEMS.filter((item) => item.group === 'compete').map((item) => (
          <NavItemLink key={item.key} item={item} dropdown onNavigate={() => { setOpen(false); onNavigate(); }} />
        ))}
      </div>
    </div>
  );
}

export function SiteNavigation() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [competeOpen, setCompeteOpen] = useState(false);
  const navContentRef = useRef<HTMLDivElement>(null);
  const mobileToggleRef = useRef<HTMLButtonElement>(null);
  const closeMobile = () => setMobileOpen(false);

  useEffect(() => {
    setMobileOpen(false);
    setCompeteOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return undefined;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (navContentRef.current?.contains(target) || mobileToggleRef.current?.contains(target)) return;
      setMobileOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [mobileOpen]);

  const handleNavigationKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape') return;
    if (competeOpen) setCompeteOpen(false);
    if (mobileOpen) setMobileOpen(false);
    mobileToggleRef.current?.focus();
  };

  return (
    <header className="header">
      <nav className="nav" aria-label="Main navigation" onKeyDown={handleNavigationKeyDown}>
        <div className="nav-inner">
          <a href={getSiteRoutePath('home')} className="nav-brand" aria-label="Maze home">
            <span className="nav-brand-mark" aria-hidden="true">
              <img className="nav-brand-logo nav-brand-logo--white" src="/css/images/maze-logo-white.svg" alt="" decoding="async" />
              <img className="nav-brand-logo nav-brand-logo--black" src="/css/images/maze-logo-black.svg" alt="" decoding="async" />
              <img className="nav-brand-logo nav-brand-logo--green" src="/css/images/maze-logo-green.svg" alt="" decoding="async" />
            </span>
          </a>

          <div ref={navContentRef} className={`nav-content${mobileOpen ? ' is-mobile-open' : ''}`} id="maze-nav-content">
            <div className="nav-links">
              <CompeteMenu open={competeOpen} setOpen={setCompeteOpen} onNavigate={closeMobile} />
              {NAV_ITEMS.filter((item) => item.group !== 'compete').map((item) => (
                <NavItemLink key={item.key} item={item} onNavigate={closeMobile} />
              ))}
            </div>
          </div>

          <div className="nav-utilities">
            <div className="nav-actions">
              <WalletConnectButton />
            </div>

            <button
              ref={mobileToggleRef}
              type="button"
              className="nav-mobile-toggle"
              aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileOpen}
              aria-controls="maze-nav-content"
              onClick={() => setMobileOpen((current) => !current)}
            >
              <span /><span /><span />
            </button>
          </div>

          <div className="nav-secondary-row">
            <GameViewSwitcher />
            <ThemeSwitcher />
          </div>
        </div>
      </nav>
    </header>
  );
}
