import '../../styles/feature-pages.css';

/** Initial Profile route placeholder; account features will be added separately. */
export function ProfilePage() {
  return (
    <main className="feature-page-shell profile-page" aria-label="Profile">
      <header className="feature-page-title">
        <span className="eyebrow">Account</span>
        <h1>Profile</h1>
        <p>Your profile space is being prepared. Profile features will be introduced in a later step.</p>
      </header>

      <section className="profile-placeholder" aria-labelledby="profile-placeholder-title">
        <span className="profile-placeholder-mark" aria-hidden="true">◎</span>
        <div>
          <h2 id="profile-placeholder-title">Coming soon</h2>
          <p>This page is the starting point for your Maze profile.</p>
        </div>
      </section>
    </main>
  );
}
