import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from '../../app/navigation';
import { getSiteRoutePath, normalizePath, resolveSiteRoute } from '../../app/routes';
import { MAZE_VIEW_URLS } from '../../features/maze/maze-routes';
import { useIdentity } from '../../platform/identity/IdentityProvider';
import { UserAvatar } from '../account/UserAvatar';
import { ThemeSwitcher } from './ThemeSwitcher';
import { ThemedSvgIcon } from '../media/ThemedSvgIcon';

type NavIconName = 'maze' | 'home' | 'explore' | 'create' | 'profile' | 'notifications';
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

const NAV_ICON_SOURCES: Record<NavIconName, string> = {
  maze: '/css/images/nav/nav-maze.svg',
  home: '/css/images/nav/nav-home.svg',
  explore: '/css/images/nav/nav-explore.svg',
  create: '/css/images/nav/nav-create.svg',
  notifications: '/css/images/nav/nav-notifications.svg',
  profile: '/css/images/nav/nav-profile.svg',
};

function NavIcon({ name, tone = 'primary' }: { name: NavIconName; tone?: 'primary' | 'secondary' | 'accent' | 'on-accent' }) {
  return <ThemedSvgIcon className="nav-dock-image" src={NAV_ICON_SOURCES[name]} tone={tone} />;
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
    >
      <span className="nav-dock-icon" aria-hidden="true">
        {avatar ?? <NavIcon name={item.icon} />}
      </span>
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
            <DockLink item={{ label: 'Maze', href: getSiteRoutePath('maze-hub'), key: 'maze-hub', icon: 'maze' }} />
            <a
              className={`nav-link nav-dock-link nav-dock-create${isCreateViewActive() ? ' active' : ''}`}
              href={MAZE_VIEW_URLS.create}
              data-nav-key="maze"
              aria-current={isCreateViewActive() ? 'page' : undefined}
              aria-label="Create a Maze"
            >
              <span className="nav-dock-icon nav-dock-create-icon" aria-hidden="true"><NavIcon name="create" tone="on-accent" /></span>
            </a>
            <NotificationsMenu open={notificationsOpen} setOpen={setNotificationsOpen} />
            <DockLink item={{ label: 'Profile', href: getSiteRoutePath('profile'), key: 'profile', icon: 'profile' }} avatar={profileAvatar} />
            <div className="nav-dock-theme-slot" role="group" aria-label="Theme selection">
              <ThemeSwitcher />
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
}
