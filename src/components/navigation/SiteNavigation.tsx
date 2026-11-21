import { useCallback, useEffect, useRef, useState, type AnimationEvent as ReactAnimationEvent, type KeyboardEvent } from 'react';
import { GameViewSwitcher } from './GameViewSwitcher';
import { WalletConnectButton } from '../../platform/wallet/WalletConnectButton';
import { ThemeSwitcher } from './ThemeSwitcher';
import { usePathname } from '../../app/navigation';
import { getSiteRoutePath, getSiteRoutePathByNavKey, normalizePath, resolveSiteRoute } from '../../app/routes';

const MOBILE_MENU_CLOSE_FALLBACK_MS = 250;
const MOBILE_MENU_EXIT_ANIMATION = 'maze-dropdown-out';

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
  const [mobileClosing, setMobileClosing] = useState(false);
  const [competeOpen, setCompeteOpen] = useState(false);
  const navContentRef = useRef<HTMLDivElement>(null);
  const mobileToggleRef = useRef<HTMLButtonElement>(null);
  const mobileClosingRef = useRef(false);
  const mobileOpenRef = useRef(false);
  const mobileCloseTimerRef = useRef<number | null>(null);

  const clearMobileCloseTimer = useCallback(() => {
    if (mobileCloseTimerRef.current === null) return;
    window.clearTimeout(mobileCloseTimerRef.current);
    mobileCloseTimerRef.current = null;
  }, []);

  const finishMobileClose = useCallback(() => {
    if (!mobileClosingRef.current) return;

    clearMobileCloseTimer();
    mobileClosingRef.current = false;
    mobileOpenRef.current = false;
    setMobileClosing(false);
    setMobileOpen(false);
    setCompeteOpen(false);
  }, [clearMobileCloseTimer]);

  const openMobile = useCallback(() => {
    clearMobileCloseTimer();
    mobileClosingRef.current = false;
    mobileOpenRef.current = true;
    setMobileClosing(false);
    setCompeteOpen(false);
    setMobileOpen(true);
  }, [clearMobileCloseTimer]);

  const closeMobile = useCallback(() => {
    if (!mobileOpenRef.current || mobileClosingRef.current) return;

    mobileClosingRef.current = true;
    setMobileClosing(true);

    // Safety net for interrupted CSS animations (for example, a viewport resize).
    clearMobileCloseTimer();
    mobileCloseTimerRef.current = window.setTimeout(
      finishMobileClose,
      MOBILE_MENU_CLOSE_FALLBACK_MS,
    );
  }, [clearMobileCloseTimer, finishMobileClose]);

  const toggleMobile = useCallback(() => {
    if (mobileClosingRef.current) {
      openMobile();
      return;
    }
    if (mobileOpen) {
      closeMobile();
    } else {
      openMobile();
    }
  }, [mobileOpen, closeMobile, openMobile]);

  const handleMobileMenuAnimationEnd = useCallback((event: ReactAnimationEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.animationName !== MOBILE_MENU_EXIT_ANIMATION) return;
    finishMobileClose();
  }, [finishMobileClose]);

  useEffect(() => {
    if (mobileOpenRef.current) {
      closeMobile();
    } else {
      setCompeteOpen(false);
    }
  }, [pathname, closeMobile]);

  useEffect(() => () => clearMobileCloseTimer(), [clearMobileCloseTimer]);

  useEffect(() => {
    if (!mobileOpen || mobileClosing) return undefined;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (navContentRef.current?.contains(target) || mobileToggleRef.current?.contains(target)) return;
      closeMobile();
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [mobileOpen, mobileClosing, closeMobile]);

  const handleNavigationKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape') return;
    if (competeOpen) {
      setCompeteOpen(false);
      return;
    }
    if (mobileOpen && !mobileClosing) {
      closeMobile();
      mobileToggleRef.current?.focus();
    }
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

          <div
            ref={navContentRef}
            className={`nav-content${mobileOpen && !mobileClosing ? ' is-mobile-open' : ''}${mobileClosing ? ' is-mobile-closing' : ''}`}
            id="maze-nav-content"
            aria-hidden={mobileClosing || undefined}
            inert={mobileClosing}
            onAnimationEnd={handleMobileMenuAnimationEnd}
          >
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
              aria-label={mobileOpen && !mobileClosing ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileOpen && !mobileClosing}
              aria-controls="maze-nav-content"
              onClick={toggleMobile}
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
