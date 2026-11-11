# Identity platform boundary

This boundary is reserved for account identity and server-issued sessions. It must remain independent from Maze simulation, room state, wallet signing and presentation components.

Production requirements before implementation:
- Internal immutable user ID; wallet addresses are linked identities, not database primary keys.
- Server-verified, one-time, expiring authentication challenges with origin/domain binding.
- Secure session lifecycle, rotation, revocation, CSRF protection where cookie sessions are used.
- Server-side authorization and audit events; never trust client-only role flags.
- Database uniqueness and transactional linking/unlinking semantics.

No account registration or authentication endpoint is implemented by this boundary yet. Do not treat the presence of this folder as an active login feature.
