import { MAZE_VIEW_URLS } from '../maze/maze-routes';
import './explore-page.css';

function ExploreIcon({ type }: { type: 'live' | 'rooms' }) {
  if (type === 'live') {
    return (
      <svg className="theme-svg-inline" viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <circle cx="24" cy="24" r="18" />
        <path d="m21 15 12 9-12 9V15Z" />
        <path d="M8 8 12 12M40 8 36 12" />
      </svg>
    );
  }

  return (
    <svg className="theme-svg-inline" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M7 13.5 24 5l17 8.5v21L24 43 7 34.5v-21Z" />
      <path d="m7.5 14 16.5 9 16.5-9M24 23v19" />
      <path d="m16 9 17 9" />
    </svg>
  );
}

const EXPLORE_DESTINATIONS = [
  {
    id: 'live',
    title: 'Live Races',
    description: 'Watch active Maze races and jump into the live action.',
    href: MAZE_VIEW_URLS.live,
    action: 'Explore live races',
  },
  {
    id: 'rooms',
    title: 'Rooms',
    description: 'Find available rooms, join a game, or check who is waiting.',
    href: MAZE_VIEW_URLS.rooms,
    action: 'Explore rooms',
  },
] as const;

export function ExplorePage() {
  return (
    <section className="route-view explore-page" aria-label="Explore Maze">
      <header className="feature-page-title explore-page-title">
        <span className="eyebrow">Discover</span>
        <h1>Explore</h1>
        <p>Find live races and rooms across Maze.</p>
      </header>

      <section className="explore-destinations" aria-label="Explore Maze destinations">
        {EXPLORE_DESTINATIONS.map((destination) => (
          <a
            className="explore-destination-card"
            href={destination.href}
            key={destination.id}
          >
            <span className={`explore-destination-icon explore-destination-icon--${destination.id}`}>
              <ExploreIcon type={destination.id} />
            </span>
            <span className="explore-destination-copy">
              <strong>{destination.title}</strong>
              <span>{destination.description}</span>
            </span>
            <span className="explore-destination-action">
              {destination.action}
              <span aria-hidden="true">↗</span>
            </span>
          </a>
        ))}
      </section>
    </section>
  );
}
