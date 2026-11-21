import { API_PATHS } from '../../services/api/contracts';
import { apiRequest } from '../../services/api/http';
import type { IdentitySessionResponse, IdentityUser, UpdateProfileInput, WalletSignInInput } from './identity-types';

export interface ChallengeResponse {
  nonce: string;
  message: string;
  expiresAt: string;
  signInInput: WalletSignInInput;
}

interface VerifyResponse {
  authenticated: true;
  user: IdentityUser;
  expiresAt: string;
}

interface ProfileResponse {
  user: IdentityUser;
}

export function getIdentitySession(signal?: AbortSignal): Promise<IdentitySessionResponse> {
  return apiRequest<IdentitySessionResponse>(API_PATHS.authSession, {
    method: 'GET',
    cache: 'no-store',
    signal,
  });
}

export function requestIdentityChallenge(walletAddress: string): Promise<ChallengeResponse> {
  return apiRequest<ChallengeResponse>(API_PATHS.authChallenge, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: walletAddress }),
  });
}

export function verifyIdentityChallenge(
  nonce: string,
  signature: string,
  proof?: { address: string; signedMessage: Uint8Array; signatureType?: string },
): Promise<VerifyResponse> {
  const body = proof
    ? {
        nonce,
        signature,
        address: proof.address,
        signedMessage: encodeSignatureBase64(proof.signedMessage),
        ...(proof.signatureType ? { signatureType: proof.signatureType } : {}),
      }
    : { nonce, signature };

  return apiRequest<VerifyResponse>(API_PATHS.authVerify, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function revokeIdentitySession(): Promise<{ authenticated: false }> {
  return apiRequest<{ authenticated: false }>(API_PATHS.authLogout, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
}

export function saveIdentityProfile(input: UpdateProfileInput): Promise<ProfileResponse> {
  return apiRequest<ProfileResponse>(API_PATHS.authProfile, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function encodeSignatureBase64(signature: Uint8Array): string {
  let binary = '';
  for (const byte of signature) binary += String.fromCharCode(byte);
  return btoa(binary);
}
