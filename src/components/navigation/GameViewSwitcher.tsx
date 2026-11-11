import { useRef, type CSSProperties, type KeyboardEvent } from 'react';
import { navigateTo } from '../../app/navigation';

const VIEWS = ['create', 'rooms', 'live'] as const;
type GameView = (typeof VIEWS)[number];

const VIEW_LABELS: Record<GameView, string> = {
  create: 'Create',
  rooms: 'Rooms',
  live: 'Live',
};

const VIEW_ICONS: Record<GameView, string> = {
  create: '/css/images/create.svg',
  rooms: '/css/images/rooms.svg',
  live: '/css/images/live.svg',
};

function readCurrentView(): GameView {
  const isMazeRoute = /(?:\/maze\.html|\/play\/?$)/i.test(window.location.pathname);
  if (!isMazeRoute) return 'create';
  const view = new URLSearchParams(window.location.search).get('view');
  return VIEWS.includes(view as GameView) ? (view as GameView) : 'create';
}

export function GameViewSwitcher() {
  const selected = readCurrentView();
  const rootRef = useRef<HTMLDivElement>(null);

  const navigate = (view: GameView, focus = false) => {
    if (focus) {
      rootRef.current
        ?.querySelector<HTMLButtonElement>(`[data-select-view="${view}"]`)
        ?.focus();
    }
    const url = new URL('./maze.html', document.baseURI);
    url.searchParams.set('view', view);
    navigateTo(url.href);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = VIEWS.indexOf(selected);
    let next: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (current + 1) % VIEWS.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (current - 1 + VIEWS.length) % VIEWS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = VIEWS.length - 1;
    if (next === null) return;
    event.preventDefault();
    navigate(VIEWS[next], true);
  };

  return (
    <div
      ref={rootRef}
      className="theme-toggle game-view-toggle"
      role="radiogroup"
      aria-label="Maze sections"
      data-view={selected}
      style={{ '--theme-index': VIEWS.indexOf(selected) } as CSSProperties}
      onKeyDown={onKeyDown}
    >
      <span className="theme-toggle__thumb" aria-hidden="true" />
      {VIEWS.map((view) => {
        const active = selected === view;
        return (
          <button
            key={view}
            className={`theme-toggle__option game-view-toggle__option${active ? ' is-active' : ''}`}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={VIEW_LABELS[view]}
            title={VIEW_LABELS[view]}
            data-select-view={view}
            tabIndex={active ? 0 : -1}
            onClick={() => navigate(view)}
          >
            <img className="theme-toggle__icon" src={VIEW_ICONS[view]} alt="" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
