import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from '../../app/navigation';
import {
  getSiteRoutePath,
  getSiteRoutePathByNavKey,
  normalizePath,
  resolveSiteRoute,
} from '../../app/routes';
import { MAZE_VIEW_URLS } from '../../features/maze/maze-routes';
import { useIdentity } from '../../platform/identity/IdentityProvider';
import { UserAvatar } from '../account/UserAvatar';

type NavIconName = 'home' | 'explore' | 'holders' | 'profile' | 'more';
type NavItem = {
  label: string;
  href: string;
  key: string;
  icon?: NavIconName;
  disabled?: boolean;
  title?: string;
};

const NAV_ITEMS: NavItem[] = [
  { label: 'Competitions', href: './competitions.html', key: 'competitions', disabled: true, title: 'Competitions are coming soon.' },
  { label: 'Leaderboard', href: './leaderboard.html', key: 'leaderboard', disabled: true, title: 'Leaderboard is coming soon.' },
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

function isCreateViewActive(): boolean {
  if (getCurrentPageKey() !== 'maze') return false;
  const view = new URLSearchParams(window.location.search).get('view');
  return view === null || view === 'create';
}

function NavIcon({ name }: { name: NavIconName }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
    focusable: false as const,
  };

  switch (name) {
    case 'home':
      return <svg {...common}><path d="m3 10 9-7 9 7" /><path d="M5.5 9v11h13V9M9 20v-6h6v6" /></svg>;
    case 'explore':
      return <svg {...common}><circle cx="11" cy="11" r="7.2" /><path d="m16.4 16.4 4.1 4.1" /><path d="m8.8 13.2 1.5-4.4 4.4-1.5-1.5 4.4-4.4 1.5Z" /></svg>;
    case 'holders':
      return <svg {...common}><circle cx="9" cy="8" r="3.2" /><path d="M2.8 20a6.2 6.2 0 0 1 12.4 0" /><path d="M16 5.2a3.2 3.2 0 0 1 0 6.2M17.5 14.2a5.2 5.2 0 0 1 3.7 5" /></svg>;
    case 'profile':
      return <svg {...common}><circle cx="12" cy="8" r="3.4" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></svg>;
    case 'more':
      return <svg {...common}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>;
  }
}

function DockLink({ item, avatar }: { item: NavItem; avatar?: ReactNode }) {
  const active = item.key === getCurrentPageKey();
  return (
    <a
      className={`nav-link nav-dock-link${active ? ' active' : ''}${item.key === 'profile' ? ' nav-dock-profile' : ''}`}
      href={item.href}
      data-nav-key={item.key}
      aria-current={active ? 'page' : undefined}
      aria-label={item.label}
      title={item.label}
    >
      <span className="nav-dock-icon" aria-hidden="true">
        {avatar ?? <NavIcon name={item.icon ?? 'home'} />}
      </span>
      <span className="nav-dock-label">{item.label}</span>
    </a>
  );
}

function MoreMenu({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const active = NAV_ITEMS.some((item) => item.key === getCurrentPageKey());

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        rootRef.current?.querySelector<HTMLButtonElement>('.nav-menu-trigger')?.focus();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, setOpen]);

  return (
    <div ref={rootRef} className={`nav-menu nav-more-menu${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className={`nav-link nav-dock-link nav-menu-trigger${active ? ' active' : ''}`}
        aria-label="More navigation"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="maze-more-menu"
        onClick={() => setOpen(!open)}
      >
        <span className="nav-dock-icon"><NavIcon name="more" /></span>
        <span className="nav-dock-label">More</span>
      </button>
      <div className="nav-dropdown nav-more-dropdown" id="maze-more-menu" role="menu" hidden={!open} aria-label="More navigation">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`nav-link nav-dropdown-link${item.key === getCurrentPageKey() ? ' active' : ''} nav-link-disabled`}
            data-nav-key={item.key}
            role="menuitem"
            disabled={item.disabled}
            title={item.title}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SiteNavigation() {
  const pathname = usePathname();
  const { isAuthenticated, user } = useIdentity();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => setMoreOpen(false), [pathname]);

  const profileAvatar = isAuthenticated && user
    ? <UserAvatar seed={user.id} imageUrl={user.avatarUrl} label="Profile" />
    : undefined;

  return (
    <header className="header">
      <nav className="nav site-bottom-nav" aria-label="Main navigation">
        <div className="nav-inner">
          <div className="nav-links">
            <DockLink item={{ label: 'Home', href: getSiteRoutePath('home'), key: 'index', icon: 'home' }} />
            <DockLink item={{ label: 'Explore', href: getSiteRoutePath('explore'), key: 'explore', icon: 'explore' }} />
            <a
              className={`nav-link nav-dock-link nav-dock-create${isCreateViewActive() ? ' active' : ''}`}
              href={MAZE_VIEW_URLS.create}
              data-nav-key="maze"
              aria-current={isCreateViewActive() ? 'page' : undefined}
              aria-label="Create a Maze"
              title="Create a Maze"
            >
              <span className="nav-dock-icon nav-dock-create-icon" aria-hidden="true"><span /></span>
              <span className="nav-dock-label">Create</span>
            </a>
            <DockLink item={{ label: 'Holders', href: getSiteRoutePathByNavKey('holders'), key: 'holders', icon: 'holders' }} />
            <MoreMenu open={moreOpen} setOpen={setMoreOpen} />
            <DockLink item={{ label: 'Profile', href: getSiteRoutePath('profile'), key: 'profile', icon: 'profile' }} avatar={profileAvatar} />
          </div>
        </div>
      </nav>
    </header>
  );
}
