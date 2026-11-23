import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from '../../app/navigation';
import { getSiteRoutePath, normalizePath, resolveSiteRoute } from '../../app/routes';
import { MAZE_VIEW_URLS } from '../../features/maze/maze-routes';
import { useIdentity } from '../../platform/identity/IdentityProvider';
import { UserAvatar } from '../account/UserAvatar';
import { ThemeSwitcher } from './ThemeSwitcher';

type NavIconName = 'home' | 'explore' | 'profile' | 'notifications';
type NavItem = {
  label: string;
  href: string;
  key: string;
  icon: NavIconName;
};

function getCurrentPageKey(): string | null {
  const path = normalizePath(window.location.pathname);
  return resolveSiteRoute(path)?.navKey ?? null;
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
    case 'notifications':
      return <svg {...common}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" /><path d="M10 21h4" /></svg>;
    case 'profile':
      return <svg {...common}><circle cx="12" cy="8" r="3.4" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></svg>;
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
        {avatar ?? <NavIcon name={item.icon} />}
      </span>
      <span className="nav-dock-label">{item.label}</span>
    </a>
  );
}

function NotificationsMenu({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
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
    <div ref={rootRef} className="nav-notifications-menu">
      <button
        ref={triggerRef}
        type="button"
        className={`nav-link nav-dock-link nav-notifications-trigger${open ? ' active' : ''}`}
        aria-label="Notifications"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="maze-notifications-panel"
        onClick={() => setOpen(!open)}
      >
        <span className="nav-dock-icon"><NavIcon name="notifications" /></span>
        <span className="nav-dock-label">Notifications</span>
      </button>
      <section
        className="nav-notifications-panel"
        id="maze-notifications-panel"
        role="dialog"
        aria-label="Notifications"
        hidden={!open}
      >
        <div className="nav-notifications-heading">Notifications</div>
        <div className="nav-notifications-empty" role="status">
          <span className="nav-notifications-empty-icon" aria-hidden="true"><NavIcon name="notifications" /></span>
          <strong>No notifications yet</strong>
          <p>Updates about your account and races will appear here.</p>
        </div>
      </section>
    </div>
  );
}

export function SiteNavigation() {
  const pathname = usePathname();
  const { isAuthenticated, user } = useIdentity();
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  useEffect(() => setNotificationsOpen(false), [pathname]);

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
            <NotificationsMenu open={notificationsOpen} setOpen={setNotificationsOpen} />
            <DockLink item={{ label: 'Profile', href: getSiteRoutePath('profile'), key: 'profile', icon: 'profile' }} avatar={profileAvatar} />
            <div className="nav-dock-theme-slot" role="group" aria-label="Theme selection" title="Choose theme">
              <ThemeSwitcher />
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
}
