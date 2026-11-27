import type { IdentitySessionResponse, IdentityUser } from './identity-types';

/**
 * Reads the session snapshot the server embedded in the HTML document
 * (see shared/identity/identity-bootstrap.js). It is read synchronously, before
 * the first React render, so a signed-in visitor never starts in a guest or
 * "checking" state. The snapshot is only a first-paint hint: IdentityProvider
 * still revalidates it against /api/auth/session in the background.
 *
 * Returns null when no valid snapshot exists (Vite dev server, legacy fallback,
 * or a server-side failure); callers then use the regular session request.
 */
const BOOTSTRAP_ELEMENT_ID = 'identity-bootstrap';
const BOOTSTRAP_VERSION = 1;

function isIdentityUser(value: unknown): value is IdentityUser {
  if (typeof value !== 'object' || value === null) return false;
  const user = value as Record<string, unknown>;
  return typeof user.id === 'string'
    && typeof user.walletAddress === 'string'
    && (user.username === null || typeof user.username === 'string')
    && (user.avatarUrl === null || typeof user.avatarUrl === 'string');
}

export function parseIdentityBootstrap(raw: string | null | undefined): IdentitySessionResponse | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as { v?: unknown; authenticated?: unknown; user?: unknown };
    if (data.v !== BOOTSTRAP_VERSION) return null;
    if (data.authenticated === true && isIdentityUser(data.user)) {
      return { authenticated: true, user: data.user };
    }
    if (data.authenticated === false) return { authenticated: false, user: null };
    return null;
  } catch {
    return null;
  }
}

let cached: IdentitySessionResponse | null | undefined;

export function readIdentityBootstrap(): IdentitySessionResponse | null {
  if (cached !== undefined) return cached;
  cached = typeof document === 'undefined'
    ? null
    : parseIdentityBootstrap(document.getElementById(BOOTSTRAP_ELEMENT_ID)?.textContent);
  return cached;
}

/** True when two session payloads describe the same signed-in state. */
export function isSameSession(a: IdentitySessionResponse, b: IdentitySessionResponse): boolean {
  if (a.authenticated !== b.authenticated) return false;
  if (!a.authenticated || !b.authenticated) return true;
  return a.user?.id === b.user?.id
    && a.user?.username === b.user?.username
    && a.user?.avatarUrl === b.user?.avatarUrl
    && a.user?.walletAddress === b.user?.walletAddress;
}
