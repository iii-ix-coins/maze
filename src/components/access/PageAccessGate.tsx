import { WalletConnectButton } from '../../platform/wallet/WalletConnectButton';
import type { IdentityStatus } from '../../platform/identity/identity-types';
import './page-access-gate.css';

export type AccessPage =
  | 'home'
  | 'explore'
  | 'maze-hub'
  | 'profile'
  | 'create'
  | 'rooms'
  | 'live'
  | 'waiting-room';

type PageAccessGateProps = {
  page: AccessPage;
  status: IdentityStatus;
  error?: string | null;
  onRetry?: () => Promise<void>;
};

type PageCopy = { title: string; eyebrow: string; description: string };

const PAGE_COPY: Record<AccessPage, PageCopy> = {
  home: {
    eyebrow: 'YOUR SOCIAL GAME SPACE',
    title: 'Home',
    description: 'Your community, activity and game sessions come together in one place.',
  },
  explore: {
    eyebrow: 'DISCOVER THE COMMUNITY',
    title: 'Explore',
    description: 'Discover people, rooms and live activity across the platform.',
  },
  'maze-hub': {
    eyebrow: 'PLAY · CREATE · CONNECT',
    title: 'Maze Hub',
    description: 'Create challenges, meet other players and follow the community from one account.',
  },
  profile: {
    eyebrow: 'YOUR PLATFORM IDENTITY',
    title: 'Profile',
    description: 'Your profile, connections, achievements and activity are tied to one verified identity.',
  },
  create: {
    eyebrow: 'CREATOR STUDIO',
    title: 'Create a game',
    description: 'Build and publish a challenge, then invite the community to play.',
  },
  rooms: {
    eyebrow: 'PLAY TOGETHER',
    title: 'Rooms',
    description: 'Find a room, join friends and coordinate your next session.',
  },
  live: {
    eyebrow: 'LIVE COMMUNITY',
    title: 'Live races',
    description: 'Follow active competitions and watch the community play in real time.',
  },
  'waiting-room': {
    eyebrow: 'READY TO PLAY',
    title: 'Waiting room',
    description: 'Join your group, confirm your place and get ready for the next session.',
  },
};

const PLATFORM_PILLARS = [
  { number: '01', title: 'One identity', detail: 'One verified account across the platform.' },
  { number: '02', title: 'One community', detail: 'People, rooms and activity stay connected.' },
  { number: '03', title: 'One experience', detail: 'Social features and games share the same site.' },
] as const;

export function PageAccessGate({ page, status, error, onRetry }: PageAccessGateProps) {
  const copy = PAGE_COPY[page];
  const isBusy = status === 'checking' || status === 'authenticating';
  const message = status === 'checking'
    ? 'Checking your secure session…'
    : status === 'authenticating'
      ? 'Verify the sign-in request in your wallet to continue.'
      : 'Connect your wallet to establish your account, then complete secure sign-in.';

  return (
    <section className="site-access-gate" aria-label={`${copy.title} access`}>
      <div className="site-access-panel">
        <div className="site-access-overview">
          <span className="site-access-eyebrow">{copy.eyebrow}</span>
          <h1>{copy.title}</h1>
          <p className="site-access-description">{copy.description}</p>
          <div className="site-access-pillars" aria-label="Platform benefits">
            {PLATFORM_PILLARS.map((pillar) => (
              <div className="site-access-pillar" key={pillar.number}>
                <span className="site-access-pillar-number">{pillar.number}</span>
                <div>
                  <strong>{pillar.title}</strong>
                  <small>{pillar.detail}</small>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="site-access-action">
          <span className="site-access-lock" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <rect x="4" y="10" width="16" height="11" rx="2" />
              <path d="M8 10V7a4 4 0 1 1 8 0v3M12 14v3" />
            </svg>
          </span>
          <div className="site-access-action-copy">
            <h2>{isBusy ? 'Verifying access' : 'Continue securely'}</h2>
            <p>{message}</p>
          </div>

          {status === 'anonymous' || status === 'authenticating' || status === 'error' ? (
            <div className="site-access-wallet">
              <WalletConnectButton variant="primary" />
            </div>
          ) : null}

          {status === 'checking' ? (
            <div className="site-access-progress" role="status"><i /> Restoring your session</div>
          ) : null}
          {status === 'authenticating' ? (
            <div className="site-access-progress" role="status"><i /> Waiting for wallet verification</div>
          ) : null}
          {status === 'error' ? (
            <div className="site-access-error" role="alert">
              <span>{error || 'Your account session could not be verified.'}</span>
              {onRetry ? (
                <button className="site-access-retry" type="button" onClick={() => { void onRetry().catch(() => undefined); }}>
                  Retry session check
                </button>
              ) : null}
            </div>
          ) : null}
          {status === 'anonymous' && error ? <p className="site-access-inline-error" role="alert">{error}</p> : null}
          <small className="site-access-security-note">
            Wallet connection alone does not unlock an account. Sign-in is verified securely; no blockchain transaction is requested.
          </small>
        </div>
      </div>
    </section>
  );
}
