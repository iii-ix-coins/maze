import { useEffect, useState, type FormEvent } from 'react';
import { UserAvatar } from '../../components/account/UserAvatar';
import { WalletConnectButton } from '../../platform/wallet/WalletConnectButton';
import { useIdentity } from '../../platform/identity/IdentityProvider';
import './profile-page.css';

function shortenAddress(address: string): string {
  return address.length > 18 ? `${address.slice(0, 9)}…${address.slice(-7)}` : address;
}

export function ProfilePage() {
  const { status, isAuthenticated, user, error: identityError, refreshSession, updateProfile } = useIdentity();
  const [username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setUsername(user?.username ?? '');
    setAvatarUrl(user?.avatarUrl ?? '');
  }, [user?.id, user?.username, user?.avatarUrl]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAuthenticated || saving) return;

    setSaving(true);
    setSaved(false);
    setFormError(null);
    try {
      await updateProfile({
        username: username.trim() ? username.trim() : null,
        avatarUrl: avatarUrl.trim() ? avatarUrl.trim() : null,
      });
      setSaved(true);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="feature-page-shell profile-page" aria-label="Profile">
      <header className="feature-page-title">
        <span className="eyebrow">Account</span>
        <h1>Profile</h1>
        <p>Your Maze identity and public profile information.</p>
      </header>

      {status === 'checking' ? (
        <section className="profile-state-card" role="status">
          <span className="profile-state-mark" aria-hidden="true">◎</span>
          <div>
            <h2>Checking account…</h2>
            <p>Restoring your secure Maze session.</p>
          </div>
        </section>
      ) : null}

      {status === 'error' ? (
        <section className="profile-state-card" role="alert">
          <span className="profile-state-mark" aria-hidden="true">!</span>
          <div>
            <h2>Account service unavailable</h2>
            <p>{identityError || 'The current account session could not be checked.'}</p>
            <button className="profile-secondary-button" type="button" onClick={() => { void refreshSession().catch(() => undefined); }}>
              Try again
            </button>
          </div>
        </section>
      ) : null}

      {status === 'anonymous' ? (
        <section className="profile-connect-stage" aria-labelledby="profile-sign-in-title">
          <div className="profile-connect-prompt">
            <svg className="profile-connect-mark theme-svg-inline" viewBox="0 0 96 96" fill="none" aria-hidden="true">
              <circle cx="48" cy="31" r="18" stroke="currentColor" strokeWidth="4" />
              <path d="M12 84c5-20 18-30 36-30s31 10 36 30" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            </svg>
            <div className="profile-connect-copy">
              <h2 id="profile-sign-in-title">Connect your wallet</h2>
              <p>Sign in to Maze to create your profile and manage your account. A separate sign-in approval is required; no blockchain transaction is requested.</p>
            </div>
            <div className="profile-connect-action">
              <WalletConnectButton />
            </div>
          </div>
        </section>
      ) : null}

      {isAuthenticated && user ? (
        <>
          <section className="profile-identity-card" aria-label="Account identity">
            <UserAvatar seed={user.id} imageUrl={user.avatarUrl} size="large" />
            <div className="profile-identity-copy">
              <span className="profile-identity-eyebrow">Maze account</span>
              <h2>{user.username || shortenAddress(user.walletAddress)}</h2>
              <span className="profile-identity-wallet" title={user.walletAddress}>{shortenAddress(user.walletAddress)}</span>
            </div>
            <span className="profile-auth-state"><span aria-hidden="true" /> Authenticated</span>
          </section>

          <section className="profile-edit-card" aria-labelledby="profile-edit-title">
            <div className="profile-section-heading">
              <div>
                <span className="eyebrow">Your identity</span>
                <h2 id="profile-edit-title">Profile details</h2>
              </div>
              <p>Your username is shown in the site navigation. Game player names remain unchanged until identity is integrated into the game and room layer.</p>
            </div>

            <form className="profile-edit-form" onSubmit={handleSubmit}>
              <label className="profile-field">
                <span>Username</span>
                <input
                  type="text"
                  name="username"
                  value={username}
                  onChange={(event) => { setUsername(event.target.value); setSaved(false); }}
                  minLength={3}
                  maxLength={20}
                  pattern="[A-Za-z0-9_]{3,20}"
                  autoComplete="nickname"
                  placeholder="maze_player"
                  aria-describedby="profile-username-help"
                />
                <small id="profile-username-help">3–20 characters. Use English letters, numbers or underscores. Leave empty to show your wallet address.</small>
              </label>

              <label className="profile-field">
                <span>Avatar image URL</span>
                <input
                  type="url"
                  name="avatarUrl"
                  maxLength={2048}
                  value={avatarUrl}
                  onChange={(event) => { setAvatarUrl(event.target.value); setSaved(false); }}
                  placeholder="https://example.com/avatar.png"
                  autoComplete="url"
                />
                <small>Use a public HTTPS image link. When empty, Maze shows a generated identicon based on your account.</small>
              </label>

              {formError ? <p className="profile-form-message is-error" role="alert">{formError}</p> : null}
              {saved ? <p className="profile-form-message is-success" role="status">Profile saved successfully.</p> : null}

              <div className="profile-form-actions">
                <button className="profile-save-button" type="submit" disabled={saving}>
                  {saving ? 'Saving…' : 'Save profile'}
                </button>
                <span className="profile-wallet-note">Wallet ownership verified</span>
              </div>
            </form>
          </section>
        </>
      ) : null}
    </main>
  );
}
