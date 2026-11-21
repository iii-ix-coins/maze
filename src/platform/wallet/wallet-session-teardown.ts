export interface WalletSessionTeardownInput {
  hasAuthenticatedSession: boolean;
  isWalletConnected: () => boolean;
  logout: () => Promise<void>;
  disconnect?: () => unknown | Promise<unknown>;
}

export type WalletSessionTeardownStage = 'logout' | 'disconnect';

/** Describes which part of the combined end-session action failed. */
export class WalletSessionTeardownError extends Error {
  readonly stage: WalletSessionTeardownStage;
  readonly sessionRevoked: boolean;

  constructor(message: string, stage: WalletSessionTeardownStage, sessionRevoked: boolean, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'WalletSessionTeardownError';
    this.stage = stage;
    this.sessionRevoked = sessionRevoked;
  }
}

/**
 * Ends the account and transport through one user action.
 *
 * Order is intentional: revoke the server session before disconnecting the
 * wallet. If logout fails, keep the wallet connected. If the wallet was
 * disconnected externally while logout was in flight, do not disconnect twice.
 */
export async function runWalletSessionTeardown({
  hasAuthenticatedSession,
  isWalletConnected,
  logout,
  disconnect,
}: WalletSessionTeardownInput): Promise<{ sessionRevoked: boolean; walletDisconnected: boolean }> {
  const walletWasConnected = isWalletConnected();

  if (walletWasConnected && typeof disconnect !== 'function') {
    throw new WalletSessionTeardownError(
      'Wallet disconnect is not available yet. Please try again.',
      'disconnect',
      false,
    );
  }

  let sessionRevoked = false;
  if (hasAuthenticatedSession) {
    try {
      await logout();
      sessionRevoked = true;
    } catch (error) {
      throw new WalletSessionTeardownError(
        'Could not revoke the Maze session. The wallet connection was left unchanged.',
        'logout',
        false,
        error,
      );
    }
  }

  if (walletWasConnected && isWalletConnected()) {
    try {
      await Promise.resolve(disconnect?.());
    } catch (error) {
      throw new WalletSessionTeardownError(
        sessionRevoked
          ? 'The Maze session was closed, but the wallet could not be disconnected.'
          : 'The wallet could not be disconnected.',
        'disconnect',
        sessionRevoked,
        error,
      );
    }
    return { sessionRevoked, walletDisconnected: true };
  }

  return { sessionRevoked, walletDisconnected: walletWasConnected };
}
