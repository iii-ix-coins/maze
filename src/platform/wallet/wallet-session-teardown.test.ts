import { describe, expect, it, vi } from 'vitest';
import {
  runWalletSessionTeardown,
  WalletSessionTeardownError,
} from './wallet-session-teardown';

describe('runWalletSessionTeardown', () => {
  it('revokes the session before disconnecting the wallet', async () => {
    const events: string[] = [];
    const result = await runWalletSessionTeardown({
      hasAuthenticatedSession: true,
      isWalletConnected: () => true,
      logout: async () => { events.push('logout'); },
      disconnect: async () => { events.push('disconnect'); },
    });

    expect(events).toEqual(['logout', 'disconnect']);
    expect(result).toEqual({ sessionRevoked: true, walletDisconnected: true });
  });

  it('does not disconnect the wallet if server logout fails', async () => {
    const disconnect = vi.fn();
    const logout = vi.fn(async () => { throw new Error('server unavailable'); });

    await expect(runWalletSessionTeardown({
      hasAuthenticatedSession: true,
      isWalletConnected: () => true,
      logout,
      disconnect,
    })).rejects.toMatchObject({
      name: 'WalletSessionTeardownError',
      stage: 'logout',
      sessionRevoked: false,
    });

    expect(logout).toHaveBeenCalledOnce();
    expect(disconnect).not.toHaveBeenCalled();
  });

  it('reports partial completion if logout succeeds but wallet disconnect fails', async () => {
    const logout = vi.fn(async () => undefined);
    const disconnect = vi.fn(async () => { throw new Error('provider unavailable'); });

    await expect(runWalletSessionTeardown({
      hasAuthenticatedSession: true,
      isWalletConnected: () => true,
      logout,
      disconnect,
    })).rejects.toMatchObject({
      name: 'WalletSessionTeardownError',
      stage: 'disconnect',
      sessionRevoked: true,
    });
  });

  it('only disconnects when the user is anonymous', async () => {
    const logout = vi.fn();
    const disconnect = vi.fn();
    const result = await runWalletSessionTeardown({
      hasAuthenticatedSession: false,
      isWalletConnected: () => true,
      logout,
      disconnect,
    });

    expect(logout).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(result).toEqual({ sessionRevoked: false, walletDisconnected: true });
  });

  it('only logs out when the wallet is already disconnected', async () => {
    const logout = vi.fn(async () => undefined);
    const disconnect = vi.fn();
    const result = await runWalletSessionTeardown({
      hasAuthenticatedSession: true,
      isWalletConnected: () => false,
      logout,
      disconnect,
    });

    expect(logout).toHaveBeenCalledOnce();
    expect(disconnect).not.toHaveBeenCalled();
    expect(result).toEqual({ sessionRevoked: true, walletDisconnected: false });
  });

  it('does not issue a second disconnect if the wallet disconnects during logout', async () => {
    let connected = true;
    const disconnect = vi.fn();
    const result = await runWalletSessionTeardown({
      hasAuthenticatedSession: true,
      isWalletConnected: () => connected,
      logout: async () => { connected = false; },
      disconnect,
    });

    expect(disconnect).not.toHaveBeenCalled();
    expect(result).toEqual({ sessionRevoked: true, walletDisconnected: true });
  });

  it('fails safely before logout if the wallet disconnect operation is not ready', async () => {
    const logout = vi.fn();

    await expect(runWalletSessionTeardown({
      hasAuthenticatedSession: true,
      isWalletConnected: () => true,
      logout,
    })).rejects.toBeInstanceOf(WalletSessionTeardownError);

    expect(logout).not.toHaveBeenCalled();
  });
});
