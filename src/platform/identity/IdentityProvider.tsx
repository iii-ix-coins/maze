import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { getSiteRoutePath } from '../../app/routes';
import { navigateTo } from '../../app/navigation';
import { ApiError } from '../../services/api/http';
import {
  encodeSignatureBase64,
  getIdentitySession,
  requestIdentityChallenge,
  revokeIdentitySession,
  saveIdentityProfile,
  verifyIdentityChallenge,
} from './identity-client';
import type {
  IdentityStatus,
  IdentityUser,
  LoginInput,
  UpdateProfileInput,
} from './identity-types';

export interface IdentityContextValue {
  status: IdentityStatus;
  isAuthenticated: boolean;
  user: IdentityUser | null;
  error: string | null;
  login: (input: LoginInput) => Promise<IdentityUser>;
  logout: () => Promise<void>;
  updateProfile: (input: UpdateProfileInput) => Promise<IdentityUser>;
  refreshSession: () => Promise<void>;
  clearError: () => void;
}

const IdentityContext = createContext<IdentityContextValue | null>(null);

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error
    && (error as { name?: unknown }).name === 'AbortError';
}

export function IdentityProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<IdentityStatus>('checking');
  const [user, setUser] = useState<IdentityUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef({ status, user });
  const loginInFlightRef = useRef(false);
  const requestVersionRef = useRef(0);
  const mountedRef = useRef(true);

  const commit = useCallback((nextStatus: IdentityStatus, nextUser: IdentityUser | null) => {
    stateRef.current = { status: nextStatus, user: nextUser };
    if (!mountedRef.current) return;
    setStatus(nextStatus);
    setUser(nextUser);
  }, []);

  const refreshSession = useCallback(async () => {
    const requestVersion = ++requestVersionRef.current;
    try {
      const response = await getIdentitySession();
      if (requestVersion !== requestVersionRef.current) return;
      commit(response.authenticated && response.user ? 'authenticated' : 'anonymous', response.user);
      setError(null);
    } catch (refreshError) {
      if (requestVersion !== requestVersionRef.current) return;
      commit('error', null);
      const message = getErrorMessage(refreshError, 'Could not restore the account session.');
      setError(message);
      throw new Error(message, { cause: refreshError });
    }
  }, [commit]);

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    const requestVersion = requestVersionRef.current;
    getIdentitySession(controller.signal)
      .then((response) => {
        // A user action (login/logout/manual refresh) supersedes the initial session read.
        if (requestVersion !== requestVersionRef.current) return;
        commit(response.authenticated && response.user ? 'authenticated' : 'anonymous', response.user);
      })
      .catch((loadError: unknown) => {
        if (isAbortError(loadError) || requestVersion !== requestVersionRef.current) return;
        commit('error', null);
        setError(getErrorMessage(loadError, 'Could not restore the account session.'));
      });

    return () => {
      mountedRef.current = false;
      controller.abort();
    };
  }, [commit]);

  const login = useCallback(async ({ walletAddress, signIn, signMessage, isWalletConnected }: LoginInput) => {
    if (loginInFlightRef.current) throw new Error('A sign-in request is already in progress.');
    if (!walletAddress) throw new Error('Connect a Solana wallet before signing in.');
    if (typeof signIn !== 'function' && typeof signMessage !== 'function') {
      throw new Error('This wallet does not support Sign In With Solana or message signing.');
    }

    if (isWalletConnected && !isWalletConnected()) {
      throw new Error('The wallet disconnected before sign-in could begin.');
    }

    loginInFlightRef.current = true;
    // After server verification, return to the exact page the visitor tried to open.
    // The current path is same-origin by construction; never accept an external redirect.
    const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`
      || getSiteRoutePath('profile');
    const requestVersion = ++requestVersionRef.current;
    commit('authenticating', null);
    setError(null);

    try {
      const challenge = await requestIdentityChallenge(walletAddress);
      if (isWalletConnected && !isWalletConnected()) {
        throw new Error('The wallet disconnected before the sign-in request was signed.');
      }
      let result: Awaited<ReturnType<typeof verifyIdentityChallenge>>;

      if (signIn) {
        // Prefer the native Wallet Standard `solana:signIn` feature. This is one
        // wallet request and returns the account, exact signed bytes and proof.
        const output = await signIn(challenge.signInInput);
        if (!output || output.account?.address !== walletAddress) {
          throw new Error('The wallet signed in with a different Solana account.');
        }
        if (output.signedMessageFormat) {
          throw new Error('This wallet returned an off-chain message envelope that the current server verifier does not support.');
        }
        if (output.signatureType && output.signatureType !== 'ed25519') {
          throw new Error('The wallet returned an unsupported signature type.');
        }
        if (!(output.signature instanceof Uint8Array) || output.signature.length !== 64) {
          throw new Error('The wallet returned an invalid Sign In signature.');
        }
        if (!(output.signedMessage instanceof Uint8Array)) {
          throw new Error('The wallet did not return the signed SIWS message bytes.');
        }

        const expectedMessage = new TextEncoder().encode(challenge.message);
        if (output.signedMessage.length !== expectedMessage.length
          || !output.signedMessage.every((byte, index) => byte === expectedMessage[index])) {
          throw new Error('The wallet signed a message that does not match the Maze sign-in challenge.');
        }

        if (isWalletConnected && !isWalletConnected()) {
          throw new Error('The wallet disconnected before the signature could be verified.');
        }
        result = await verifyIdentityChallenge(
          challenge.nonce,
          encodeSignatureBase64(output.signature),
          {
            address: output.account.address,
            signedMessage: output.signedMessage,
            signatureType: output.signatureType,
          },
        );
      } else {
        // Compatibility path for Reown providers / wallets that only expose signMessage.
        const messageBytes = new TextEncoder().encode(challenge.message);
        const signature = await signMessage!(messageBytes);
        if (!(signature instanceof Uint8Array) || signature.length !== 64) {
          throw new Error('The wallet returned an invalid message signature.');
        }
        if (isWalletConnected && !isWalletConnected()) {
          throw new Error('The wallet disconnected before the signature could be verified.');
        }
        result = await verifyIdentityChallenge(
          challenge.nonce,
          encodeSignatureBase64(signature),
        );
      }

      if (!result.authenticated || !result.user) {
        throw new Error('The server did not establish an authenticated session.');
      }

      // Verification may finish after the user disconnects or another account action
      // supersedes this attempt. Revoke the just-created cookie before rejecting it.
      const walletStillConnected = !isWalletConnected || isWalletConnected();
      if (requestVersion !== requestVersionRef.current || !walletStillConnected) {
        try {
          await revokeIdentitySession();
        } catch (revokeError) {
          console.error('[Identity] Could not revoke a superseded sign-in session:', revokeError);
        }
        throw new Error(walletStillConnected
          ? 'This sign-in attempt was superseded by another account action.'
          : 'The wallet disconnected before sign-in completed. Please connect again.');
      }

      commit('authenticated', result.user);
      navigateTo(returnTo);
      return result.user;
    } catch (loginError) {
      if (requestVersion === requestVersionRef.current) {
        commit('anonymous', null);
        const message = getErrorMessage(loginError, 'Wallet sign-in was not completed.');
        setError(message);
        throw new Error(message, { cause: loginError });
      }
      throw loginError;
    } finally {
      loginInFlightRef.current = false;
    }
  }, [commit]);

  const logout = useCallback(async () => {
    const requestVersion = ++requestVersionRef.current;
    setError(null);
    try {
      await revokeIdentitySession();
      if (requestVersion === requestVersionRef.current) commit('anonymous', null);
    } catch (logoutError) {
      if (requestVersion !== requestVersionRef.current) return;
      const message = getErrorMessage(logoutError, 'Could not sign out. Please try again.');
      setError(message);
      throw new Error(message, { cause: logoutError });
    }
  }, [commit]);

  const updateProfile = useCallback(async (input: UpdateProfileInput) => {
    if (stateRef.current.status !== 'authenticated' || !stateRef.current.user) {
      throw new Error('Sign in to update your profile.');
    }
    const requestVersion = ++requestVersionRef.current;
    setError(null);
    try {
      const response = await saveIdentityProfile(input);
      if (requestVersion !== requestVersionRef.current) return response.user;
      commit('authenticated', response.user);
      return response.user;
    } catch (profileError) {
      if (requestVersion === requestVersionRef.current && profileError instanceof ApiError && profileError.status === 401) {
        commit('anonymous', null);
      }
      throw profileError;
    }
  }, [commit]);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<IdentityContextValue>(() => ({
    status,
    isAuthenticated: status === 'authenticated' && user !== null,
    user,
    error,
    login,
    logout,
    updateProfile,
    refreshSession,
    clearError,
  }), [status, user, error, login, logout, updateProfile, refreshSession, clearError]);

  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}

export function useIdentity(): IdentityContextValue {
  const value = useContext(IdentityContext);
  if (!value) throw new Error('useIdentity must be used inside IdentityProvider.');
  return value;
}
