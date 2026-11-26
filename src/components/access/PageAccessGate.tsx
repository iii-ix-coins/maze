import { WalletConnectButton } from '../../platform/wallet/WalletConnectButton';
import type { IdentityStatus } from '../../platform/identity/identity-types';
import './page-access-gate.css';

export type AccessPreviewPage =
  | 'home'
  | 'explore'
  | 'maze-hub'
  | 'profile'
  | 'create'
  | 'rooms'
  | 'live'
  | 'waiting-room';

type PageAccessGateProps = {
  page: AccessPreviewPage;
  status: IdentityStatus;
  error?: string | null;
  onRetry?: () => Promise<void>;
};

type PageCopy = { title: string; eyebrow: string; description: string; previewLabel: string };

const PAGE_COPY: Record<AccessPreviewPage, PageCopy> = {
  home: {
    eyebrow: 'THE MAZE NETWORK',
    title: 'Home',
    description: 'Discover active races, open rooms and recent results from across the Maze network.',
    previewLabel: 'A glimpse of the live game feed',
  },
  explore: {
    eyebrow: 'DISCOVER',
    title: 'Explore',
    description: 'Find rooms, discover new races and see what is happening throughout Maze.',
    previewLabel: 'A glimpse of rooms and races',
  },
  'maze-hub': {
    eyebrow: 'PLAY · CREATE · COMPETE',
    title: 'Maze Hub',
    description: 'Your starting point for creating a maze, exploring the game and preparing to compete.',
    previewLabel: 'A glimpse of Maze Hub',
  },
  profile: {
    eyebrow: 'YOUR ACCOUNT',
    title: 'Profile',
    description: 'Connect your wallet and verify ownership to create your Maze identity and manage your profile.',
    previewLabel: 'A glimpse of your Maze profile',
  },
  create: {
    eyebrow: 'GAME STUDIO',
    title: 'Create a game',
    description: 'Configure the maze size, racers and targets, then launch your own race.',
    previewLabel: 'A glimpse of the game creator',
  },
  rooms: {
    eyebrow: 'MULTIPLAYER',
    title: 'Rooms',
    description: 'Browse waiting rooms, compare available seats and join other players.',
    previewLabel: 'A glimpse of the room browser',
  },
  live: {
    eyebrow: 'LIVE COMPETITION',
    title: 'Live races',
    description: 'Watch races in progress and follow the players as they navigate the maze.',
    previewLabel: 'A glimpse of a live race',
  },
  'waiting-room': {
    eyebrow: 'RACE LOBBY',
    title: 'Waiting room',
    description: 'Meet the racers, check the lobby and get ready before the race begins.',
    previewLabel: 'A glimpse of the waiting room',
  },
};

function PreviewHeader({ label }: { label: string }) {
  return (
    <div className="access-preview-header">
      <span className="access-preview-brand"><span className="access-preview-brand-mark" /> MAZE</span>
      <span className="access-preview-label">{label}</span>
      <span className="access-preview-dots" aria-hidden="true"><i /><i /><i /></span>
    </div>
  );
}

function PreviewStats({ values }: { values: Array<[string, string]> }) {
  return (
    <div className="access-preview-stats">
      {values.map(([value, label]) => (
        <div className="access-preview-stat" key={label}><strong>{value}</strong><span>{label}</span></div>
      ))}
    </div>
  );
}

function PreviewRoom({ title, code, players, live = false }: { title: string; code: string; players: string; live?: boolean }) {
  return (
    <div className="access-preview-room">
      <span className={`access-preview-status${live ? ' is-live' : ''}`}><i />{live ? 'LIVE' : 'OPEN'}</span>
      <div className="access-preview-room-copy"><strong>{title}</strong><span>Room {code} · {players}</span></div>
      <span className="access-preview-room-arrow" aria-hidden="true">↗</span>
    </div>
  );
}

function PreviewMaze({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`access-preview-maze${compact ? ' is-compact' : ''}`} aria-hidden="true">
      {Array.from({ length: compact ? 36 : 64 }, (_, index) => (
        <i key={index} className={[3, 4, 10, 14, 18, 21, 22, 28, 32, 35, 39, 42, 45, 49, 53, 54, 60].includes(index) ? 'is-wall' : ''} />
      ))}
      <span className="access-preview-player" />
      <span className="access-preview-goal" />
    </div>
  );
}

function AccessPreview({ page }: { page: AccessPreviewPage }) {
  switch (page) {
    case 'profile':
      return (
        <div className="access-preview-scene access-preview-profile">
          <div className="access-preview-profile-card">
            <span className="access-preview-avatar" aria-hidden="true">M</span>
            <div><strong>maze_player</strong><span>Verified Maze member</span></div>
            <i className="access-preview-verified" />
          </div>
          <PreviewStats values={[["08", 'Races'], ["05", 'Wins'], ["12", 'Friends']]} />
          <div className="access-preview-section-title">RECENT ACTIVITY</div>
          <div className="access-preview-activity"><span className="access-preview-activity-icon">♜</span><div><strong>Race completed</strong><small>Maze 33 × 33 · 4 players</small></div><b>+120</b></div>
          <div className="access-preview-activity"><span className="access-preview-activity-icon">◇</span><div><strong>New achievement</strong><small>Pathfinder · Level 2</small></div><b>NEW</b></div>
        </div>
      );
    case 'home':
      return (
        <div className="access-preview-scene">
          <PreviewStats values={[["128", 'Online'], ["06", 'Live races'], ["14", 'Rooms']]} />
          <div className="access-preview-section-title">LIVE NOW</div>
          <PreviewRoom title="Neon sprint" code="MZ-204" players="4 / 6" live />
          <PreviewRoom title="Forest run" code="MZ-118" players="3 / 4" live />
          <div className="access-preview-section-title">OPEN ROOMS</div>
          <PreviewRoom title="Quick challenge" code="MZ-091" players="2 / 4" />
        </div>
      );
    case 'explore':
    case 'rooms':
      return (
        <div className="access-preview-scene">
          <div className="access-preview-filter-row"><i className="is-active">All rooms</i><i>Waiting</i><i>Live</i></div>
          <PreviewRoom title="Neon sprint" code="MZ-204" players="4 / 6" live />
          <PreviewRoom title="Forest run" code="MZ-118" players="3 / 4" />
          <PreviewRoom title="Crystal maze" code="MZ-073" players="2 / 8" />
          <PreviewRoom title="Night circuit" code="MZ-062" players="5 / 6" />
          <div className="access-preview-room-skeleton"><i /><i /><i /></div>
        </div>
      );
    case 'maze-hub':
      return (
        <div className="access-preview-scene access-preview-hub">
          <div className="access-preview-hero"><span>PLAY · CREATE · COMPETE</span><strong>Find your way<br />through the maze.</strong><i>Explore the Maze universe</i></div>
          <PreviewStats values={[["01", 'Create'], ["02", 'Explore'], ["03", 'Compete']]} />
          <div className="access-preview-hub-card"><PreviewMaze compact /><div><strong>Build your next challenge</strong><small>Choose a maze. Set the pace.</small></div></div>
        </div>
      );
    case 'create':
      return (
        <div className="access-preview-scene access-preview-create">
          <div className="access-preview-stepper"><b>01 SIZE</b><i /><span>02 RACERS</span><i /><span>03 TARGETS</span><i /><span>04 LAUNCH</span></div>
          <div className="access-preview-create-layout"><div><small>MAZE SIZE</small><strong>Medium</strong><span>33 × 33 cells</span><div className="access-preview-range"><i /></div><small>Balanced paths and turns</small></div><PreviewMaze /></div>
          <div className="access-preview-bottom-line"><span>PREVIEW MODE</span><b>CONTINUE&nbsp; →</b></div>
        </div>
      );
    case 'live':
      return (
        <div className="access-preview-scene access-preview-live">
          <div className="access-preview-live-heading"><span><i /> LIVE RACE</span><b>02:48</b></div>
          <div className="access-preview-live-layout"><PreviewMaze /><div className="access-preview-rankings"><small>RANKING</small><b>01 <i /> Nova</b><b>02 <i /> MazeFox</b><b>03 <i /> Orbit</b><b>04 <i /> Pixel</b></div></div>
          <PreviewStats values={[["04", 'Racers'], ["12", 'Targets'], ["68%", 'Complete']]} />
        </div>
      );
    case 'waiting-room':
      return (
        <div className="access-preview-scene access-preview-waiting">
          <div className="access-preview-waiting-title"><span>ROOM MZ-204</span><b>WAITING FOR RACERS</b></div>
          <PreviewStats values={[["04", 'Joined'], ["06", 'Capacity'], ["02", 'Ready']]} />
          {['Nova', 'MazeFox', 'Orbit', 'Pixel'].map((name, index) => <div className="access-preview-racer" key={name}><i>{name.slice(0, 1)}</i><strong>{name}</strong><span>{index < 2 ? 'READY' : 'WAITING'}</span></div>)}
          <div className="access-preview-bottom-line"><span>HOST: NOVA</span><b>STARTING SOON</b></div>
        </div>
      );
  }
}

export function PageAccessGate({ page, status, error, onRetry }: PageAccessGateProps) {
  const copy = PAGE_COPY[page];
  const isBusy = status === 'checking' || status === 'authenticating';
  const message = status === 'checking'
    ? 'Checking your Maze session…'
    : status === 'authenticating'
      ? 'Verifying wallet ownership. Approve the sign-in request in your wallet to continue.'
      : null;

  return (
    <main className={`feature-page-shell access-gate access-gate--${page}`} aria-label={`${copy.title} sign-in preview`}>
      <section className="access-gate-intro">
        <span className="access-gate-eyebrow">{copy.eyebrow}</span>
        <h1>{copy.title}</h1>
        <p>{copy.description}</p>
      </section>

      <section className="access-gate-content" aria-label="Sign-in required">
        <div className="access-gate-preview-column">
          <div className="access-gate-preview-frame" role="img" aria-label={copy.previewLabel}>
            <div className="access-gate-preview-track" aria-hidden="true" inert>
              <PreviewHeader label={copy.title} />
              <AccessPreview page={page} />
              <div className="access-preview-preview-footer"><span>MAZE · MEMBER PREVIEW</span><i /></div>
            </div>
            <span className="access-gate-preview-shade" aria-hidden="true" />
            <span className="access-gate-preview-lock" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><rect x="4.5" y="10" width="15" height="11" rx="1.5" /><path d="M8 10V7a4 4 0 1 1 8 0v3" /></svg></span>
          </div>
          <span className="access-gate-preview-caption">{copy.previewLabel} · Read-only preview</span>
        </div>

        <div className="access-gate-action-column">
          <span className="access-gate-lock-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 1 1 8 0v3M12 14v3" /></svg></span>
          <h2>{isBusy ? 'One moment' : 'Unlock the full Maze'}</h2>
          <p>{isBusy ? message : 'Connect your Solana wallet and complete secure sign-in. The full page opens only after Maze verifies your identity.'}</p>

          {status === 'anonymous' || status === 'authenticating' || status === 'error' ? (
            <div className="access-gate-wallet"><WalletConnectButton /></div>
          ) : null}

          {status === 'checking' ? <div className="access-gate-progress" role="status"><i /> Restoring secure session</div> : null}
          {status === 'authenticating' ? <div className="access-gate-progress" role="status"><i /> Waiting for wallet verification</div> : null}
          {status === 'error' ? (
            <div className="access-gate-error" role="alert">
              <span>{error || 'The account session could not be verified.'}</span>
              {onRetry ? <button type="button" onClick={() => { void onRetry().catch(() => undefined); }}>Retry session check</button> : null}
            </div>
          ) : null}
          {status === 'anonymous' && error ? <p className="access-gate-inline-error" role="alert">{error}</p> : null}
          <small className="access-gate-security-note">Wallet connection alone does not unlock the site. A verified sign-in is required; no blockchain transaction is requested.</small>
        </div>
      </section>
    </main>
  );
}
