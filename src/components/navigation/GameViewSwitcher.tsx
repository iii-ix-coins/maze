
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

/**
 * Detect the active game section from the current URL.
 *
 * Outside Maze routes, no game section is selected.
 * Inside Maze routes, the default section remains Create.
 */
function readCurrentView(): GameView | null {
  const isMazeRoute = /(?:\/maze\.html|\/play\/?$)/i.test(
    window.location.pathname
  );

  if (!isMazeRoute) return null;

  const requestedView = new URLSearchParams(
    window.location.search
  ).get('view');

  return VIEWS.includes(requestedView as GameView)
    ? (requestedView as GameView)
    : 'create';
}

export function GameViewSwitcher() {
  const selected = readCurrentView();

  const rootRef = useRef<HTMLDivElement>(null);

  // -1 means that no section is currently selected.
  const selectedIndex = selected === null
    ? -1
    : VIEWS.indexOf(selected);

  // Keep the thumb index valid even when no section is selected.
  const thumbIndex = Math.max(0, selectedIndex);

  const navigate = (view: GameView, focus = false) => {
    if (focus) {
      rootRef.current
        ?.querySelector<HTMLButtonElement>(
          `[data-select-view="${view}"]`
        )
        ?.focus();
    }

    const url = new URL('./maze.html', document.baseURI);

    url.searchParams.set('view', view);

    navigateTo(url.href);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Prefer the currently focused option.
    // When no option is selected, start from Create.
    const focusedView = rootRef.current
      ?.querySelector<HTMLButtonElement>(
        '[data-select-view]:focus'
      )
      ?.dataset.selectView;

    const focusedIndex = VIEWS.findIndex(
      (view) => view === focusedView
    );

    const currentIndex = focusedIndex >= 0
      ? focusedIndex
      : selectedIndex >= 0
        ? selectedIndex
        : 0;

    let next: number | null = null;

    if (
      event.key === 'ArrowRight' ||
      event.key === 'ArrowDown'
    ) {
      next = (currentIndex + 1) % VIEWS.length;
    } else if (
      event.key === 'ArrowLeft' ||
      event.key === 'ArrowUp'
    ) {
      next = (currentIndex - 1 + VIEWS.length) % VIEWS.length;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = VIEWS.length - 1;
    }

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
      data-view={selected ?? 'none'}
      style={{
        '--theme-index': thumbIndex,
      } as CSSProperties}
      onKeyDown={onKeyDown}
    >
      {/* Show the moving indicator only when a section is selected. */}
      {selected !== null && (
        <span
          className="theme-toggle__thumb"
          aria-hidden="true"
        />
      )}

      {VIEWS.map((view) => {
        const active = selected === view;

        // Keep the first option keyboard-accessible when
        // the current page has no selected game section.
        const isKeyboardEntry =
          selected === null && view === VIEWS[0];

        return (
          <button
            key={view}
            className={`theme-toggle__option game-view-toggle__option${active ? ' is-active' : ''
              }`}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={VIEW_LABELS[view]}
            title={VIEW_LABELS[view]}
            data-select-view={view}
            tabIndex={active || isKeyboardEntry ? 0 : -1}
            onClick={() => navigate(view)}
          >
            <img
              className="theme-toggle__icon"
              src={VIEW_ICONS[view]}
              alt=""
              aria-hidden="true"
            />

            <span className="game-view-toggle__label">
              {VIEW_LABELS[view]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
