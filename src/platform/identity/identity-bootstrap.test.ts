import { describe, expect, it } from 'vitest';
import { isSameSession, parseIdentityBootstrap } from './identity-bootstrap';

const user = { id: 'u1', username: 'neo', avatarUrl: null, walletAddress: 'Wallet1111' };

describe('parseIdentityBootstrap', () => {
  it('reads authenticated and anonymous snapshots', () => {
    expect(parseIdentityBootstrap(JSON.stringify({ v: 1, authenticated: true, user })))
      .toEqual({ authenticated: true, user });
    expect(parseIdentityBootstrap(JSON.stringify({ v: 1, authenticated: false, user: null })))
      .toEqual({ authenticated: false, user: null });
  });

  it('rejects missing, malformed, wrong-version and incomplete payloads', () => {
    expect(parseIdentityBootstrap(null)).toBeNull();
    expect(parseIdentityBootstrap('not json')).toBeNull();
    expect(parseIdentityBootstrap(JSON.stringify({ v: 2, authenticated: false, user: null }))).toBeNull();
    expect(parseIdentityBootstrap(JSON.stringify({ v: 1, authenticated: true, user: { id: 'x' } }))).toBeNull();
  });
});

describe('isSameSession', () => {
  it('compares signed-in identity and profile fields', () => {
    expect(isSameSession({ authenticated: true, user }, { authenticated: true, user: { ...user } })).toBe(true);
    expect(isSameSession({ authenticated: true, user }, { authenticated: true, user: { ...user, username: 'x' } })).toBe(false);
    expect(isSameSession({ authenticated: true, user }, { authenticated: false, user: null })).toBe(false);
    expect(isSameSession({ authenticated: false, user: null }, { authenticated: false, user: null })).toBe(true);
  });
});
