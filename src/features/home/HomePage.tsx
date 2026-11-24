import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { MAZE_DOCUMENT_URL, MAZE_VIEW_URLS } from '../maze/maze-routes';
import {
  fetchGameFeedSnapshot,
  type FinishedGameSummary,
  type GameFeedSnapshot,
  type GameRoomSummary,
} from './game-feed-api';
import './game-feed.css';

type FeedFilter = 'all' | 'live' | 'rooms' | 'finished';

function formatElapsed(timestamp: number | undefined): string {
  if (!timestamp || !Number.isFinite(timestamp)) return 'Recently';
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatDuration(milliseconds: number): string {
  const total = Math.max(0, Math.floor((Number(milliseconds) || 0) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function GamePostHeader({ name, detail, status }: { name: string; detail: string; status: 'live' | 'open' | 'finished' }) {
  const initial = (name.trim()[0] || 'M').toUpperCase();
  const label = status === 'live' ? 'LIVE' : status === 'open' ? 'OPEN ROOM' : 'FINISHED';
  return (
    <header className="game-feed-post-header">
      <span className="game-feed-author-mark" aria-hidden="true">{initial}</span>
      <span className="game-feed-author-copy">
        <strong>{name || 'Maze player'}</strong>
        <small>{detail}</small>
      </span>
      <span className={`game-feed-status game-feed-status--${status}`}>{label}</span>
    </header>
  );
}

function RoomPost({ room, live }: { room: GameRoomSummary; live: boolean }) {
  const joinHref = `${MAZE_DOCUMENT_URL}?room=${encodeURIComponent(room.code)}`;
  const title = live ? `${room.host}'s live race` : `${room.host}'s open room`;
  const detail = `${room.size} × ${room.size} maze · ${room.goals} goals`;
  const actionHref = live ? MAZE_VIEW_URLS.live : joinHref;
  const actionLabel = live ? 'Browse live races' : 'Join room';

  return (
    <article className="game-feed-post" data-game-status={live ? 'live' : 'open'}>
      <GamePostHeader
        name={room.host}
        detail={`${live ? 'Started' : 'Opened'} ${formatElapsed(live ? room.startedAt : room.createdAt)}`}
        status={live ? 'live' : 'open'}
      />
      <div className={`game-feed-post-art ${live ? 'game-feed-post-art--live' : 'game-feed-post-art--open'}`} aria-hidden="true">
        <span className="game-feed-art-grid" />
        <span className="game-feed-art-center">
          <span>MAZE SESSION</span>
          <strong>{room.code}</strong>
        </span>
        <span className="game-feed-art-size">{room.size} × {room.size}</span>
      </div>
      <div className="game-feed-post-body">
        <div className="game-feed-post-title-row">
          <h3>{title}</h3>
          <span className="game-feed-post-code">{room.code}</span>
        </div>
        <p>{detail}</p>
        <div className="game-feed-stat-row">
          <span><strong>{room.count}</strong> / {room.capacity} players</span>
          {live ? <span><strong>{room.spectators || 0}</strong> watching</span> : <span><strong>{Math.max(0, room.capacity - room.count)}</strong> seats left</span>}
          {live && room.leader?.name ? <span>Leading: <strong>{room.leader.name}</strong></span> : null}
        </div>
        <a className="game-feed-action" href={actionHref}>{actionLabel}<span aria-hidden="true">↗</span></a>
      </div>
    </article>
  );
}

function FinishedPost({ game }: { game: FinishedGameSummary }) {
  return (
    <article className="game-feed-post game-feed-post--finished" data-game-status="finished">
      <GamePostHeader
        name={game.winner}
        detail={`Won room ${game.code} · ${formatElapsed(game.finishedAt)}`}
        status="finished"
      />
      <div className="game-feed-finish-art">
        <span className="game-feed-finish-mark" style={{ color: game.winnerColor || 'var(--mint)' }} aria-hidden="true">♛</span>
        <span className="game-feed-finish-caption">RACE COMPLETED</span>
        <strong>{game.winner}</strong>
        <small>Winner · Room {game.code}</small>
      </div>
      <div className="game-feed-post-body">
        <h3>{game.winner} won the race</h3>
        <p>{game.size} × {game.size} maze · {game.goals} goals</p>
        <div className="game-feed-stat-row">
          <span><strong>{game.racers}</strong> racers</span>
          <span><strong>{formatDuration(game.durationMs)}</strong> duration</span>
        </div>
        <p className="game-feed-replay-note">This is a recent result summary. Persistent replay recording is not available yet.</p>
      </div>
    </article>
  );
}

function FeedSection({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="game-feed-section">
      <header className="game-feed-section-heading">
        <h2>{title}</h2>
        <span>{count}</span>
      </header>
      {children}
    </section>
  );
}

export function HomePage() {
  const [snapshot, setSnapshot] = useState<GameFeedSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [refreshVersion, setRefreshVersion] = useState(0);

  const refresh = useCallback(() => setRefreshVersion((value) => value + 1), []);

  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    let controller: AbortController | null = null;

    const load = async () => {
      if (disposed || inFlight || document.hidden) return;
      inFlight = true;
      controller = new AbortController();
      let timedOut = false;
      const timeout = window.setTimeout(() => {
        timedOut = true;
        controller?.abort();
      }, 9000);
      try {
        const next = await fetchGameFeedSnapshot(controller.signal);
        if (disposed) return;
        setSnapshot(next);
        setError(null);
        setLoading(false);
      } catch (cause) {
        if (disposed) return;
        if (cause instanceof DOMException && cause.name === 'AbortError' && !timedOut) return;
        setError(timedOut ? 'The Maze server did not respond in time.' : cause instanceof Error ? cause.message : 'Game feed is temporarily unavailable.');
        setLoading(false);
      } finally {
        window.clearTimeout(timeout);
        inFlight = false;
      }
    };

    void load();
    const interval = window.setInterval(() => void load(), 10_000);
    const onVisibility = () => { if (!document.hidden) void load(); };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      disposed = true;
      controller?.abort();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refreshVersion]);

  const rooms = snapshot?.rooms ?? [];
  const liveRooms = useMemo(() => rooms.filter((room) => room.phase === 'playing'), [rooms]);
  const openRooms = useMemo(() => rooms.filter((room) => room.phase === 'waiting' && room.count < room.capacity), [rooms]);
  const recentGames = snapshot?.recent ?? [];
  const hasContent = liveRooms.length + openRooms.length + recentGames.length > 0;

  return (
    <main className="feature-page-shell game-feed-page" aria-label="Maze game feed">
      <header className="game-feed-heading">
        <div>
          <span className="eyebrow">THE MAZE NETWORK</span>
          <h1>Home</h1>
          <p>Live races, open rooms and recent game results from across Maze.</p>
        </div>
        <button className="game-feed-refresh" type="button" onClick={refresh} disabled={loading} aria-label="Refresh game feed">↻</button>
      </header>

      <div className="game-feed-overview" aria-label="Maze network status">
        <div><strong>{snapshot?.counts.onlinePlayers ?? '—'}</strong><span>Online players</span></div>
        <div><strong>{snapshot?.counts.liveRooms ?? liveRooms.length}</strong><span>Live races</span></div>
        <div><strong>{snapshot?.counts.waitingRooms ?? openRooms.length}</strong><span>Open rooms</span></div>
      </div>

      <div className="game-feed-filters" aria-label="Filter game feed">
        {([
          ['all', 'For you'],
          ['live', 'Live'],
          ['rooms', 'Open rooms'],
          ['finished', 'Finished'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={filter === value ? 'is-active' : ''}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >{label}</button>
        ))}
      </div>

      {error ? <div className="game-feed-message game-feed-message--error" role="status">{error}{snapshot ? ' Showing the last available snapshot.' : ''}</div> : null}
      {loading ? <div className="game-feed-message" role="status">Connecting to the Maze network…</div> : null}

      {(filter === 'all' || filter === 'live') ? (
        <FeedSection title="Live games" count={liveRooms.length}>
          {liveRooms.length ? <div className="game-feed-grid">{liveRooms.map((room) => <RoomPost key={room.id} room={room} live />)}</div> : <p className="game-feed-empty">No races are running right now.</p>}
        </FeedSection>
      ) : null}

      {(filter === 'all' || filter === 'rooms') ? (
        <FeedSection title="Open rooms" count={openRooms.length}>
          {openRooms.length ? <div className="game-feed-grid">{openRooms.map((room) => <RoomPost key={room.id} room={room} live={false} />)}</div> : <p className="game-feed-empty">No open rooms are waiting for players.</p>}
        </FeedSection>
      ) : null}

      {(filter === 'all' || filter === 'finished') ? (
        <FeedSection title="Just finished" count={recentGames.length}>
          {recentGames.length ? <div className="game-feed-grid">{recentGames.map((game) => <FinishedPost key={`${game.id}:${game.finishedAt}`} game={game} />)}</div> : <p className="game-feed-empty">No recent finishes yet. Completed result summaries appear here briefly.</p>}
        </FeedSection>
      ) : null}

      {!loading && !error && !hasContent ? <div className="game-feed-message">The Maze network is online, but there are no games to show yet. Create a room to start the feed.</div> : null}
      <p className="game-feed-footnote">Live room data refreshes every 10 seconds. Finished items are temporary result summaries; persistent replays will be added with the recording system.</p>
    </main>
  );
}
