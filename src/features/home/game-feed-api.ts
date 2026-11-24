export interface GameRoomSummary {
  id: string;
  code: string;
  phase: 'waiting' | 'preparing' | 'playing';
  size: number;
  goals: number;
  capacity: number;
  count: number;
  host: string;
  createdAt: number;
  startedAt?: number;
  spectators?: number;
  racers?: number;
  leader?: { name: string; color?: string; goals: number } | null;
}

export interface FinishedGameSummary {
  id: string;
  code: string;
  size: number;
  goals: number;
  winner: string;
  winnerColor?: string;
  racers: number;
  durationMs: number;
  finishedAt: number;
}

export interface GameFeedSnapshot {
  rooms: GameRoomSummary[];
  recent: FinishedGameSummary[];
  counts: {
    onlinePlayers: number;
    waitingRooms: number;
    liveRooms: number;
    livePlayers: number;
    spectators: number;
  };
  receivedAt: number;
}

/** Resolve the existing Maze server's read-only lobby endpoint. */
export function getGameFeedEndpoint(): string | null {
  const configured = document
    .querySelector<HTMLMetaElement>('meta[name="maze-multiplayer-url"]')
    ?.content.trim();

  if (configured) {
    try {
      const server = new URL(configured, window.location.href);
      if (server.protocol === 'ws:') server.protocol = 'http:';
      if (server.protocol === 'wss:') server.protocol = 'https:';
      if (server.protocol !== 'http:' && server.protocol !== 'https:') return null;
      return new URL('/rooms', server.origin).href;
    } catch {
      return null;
    }
  }

  // Vite proxies /rooms to the local Maze server on port 8081.
  const localHosts = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);
  if (localHosts.has(window.location.hostname.toLowerCase())) {
    // The Vite dev server proxies /rooms; Express/preview deployments use the local Maze port directly.
    if (window.location.port === '5173') {
      return new URL('/rooms', window.location.origin).href;
    }
    const scheme = window.location.protocol === 'https:' ? 'https:' : 'http:';
    return `${scheme}//${window.location.hostname}:8081/rooms`;
  }

  // Production must provide MAZE_PUBLIC_URL; guessing another service's host is unsafe.
  return null;
}

export async function fetchGameFeedSnapshot(signal?: AbortSignal): Promise<GameFeedSnapshot> {
  const endpoint = getGameFeedEndpoint();
  if (!endpoint) {
    throw new Error('The Maze multiplayer endpoint is not configured for this site.');
  }

  const response = await fetch(endpoint, {
    method: 'GET',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) {
    throw new Error(`Game feed could not be loaded (HTTP ${response.status}).`);
  }

  const payload = await response.json() as Record<string, unknown>;
  const rooms = Array.isArray(payload.rooms) ? payload.rooms : [];
  const recent = Array.isArray(payload.recent) ? payload.recent : [];
  const rawCounts = payload.counts && typeof payload.counts === 'object'
    ? payload.counts as Record<string, unknown>
    : {};
  const count = (key: string) => Math.max(0, Number(rawCounts[key]) || 0);

  return {
    rooms: rooms.filter((room): room is GameRoomSummary => Boolean(
      room && typeof room === 'object' &&
      typeof (room as GameRoomSummary).id === 'string' &&
      typeof (room as GameRoomSummary).code === 'string' &&
      ['waiting', 'preparing', 'playing'].includes((room as GameRoomSummary).phase)
    )),
    recent: recent.filter((entry): entry is FinishedGameSummary => Boolean(
      entry && typeof entry === 'object' &&
      typeof (entry as FinishedGameSummary).id === 'string' &&
      typeof (entry as FinishedGameSummary).winner === 'string'
    )),
    counts: {
      onlinePlayers: count('onlinePlayers'),
      waitingRooms: count('waitingRooms'),
      liveRooms: count('liveRooms'),
      livePlayers: count('livePlayers'),
      spectators: count('spectators'),
    },
    receivedAt: Date.now(),
  };
}
