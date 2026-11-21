export type IdentityStatus =
  | 'checking'
  | 'anonymous'
  | 'authenticating'
  | 'authenticated'
  | 'error';

export interface IdentityUser {
  id: string;
  username: string | null;
  avatarUrl: string | null;
  walletAddress: string;
}

export interface IdentitySessionResponse {
  authenticated: boolean;
  user: IdentityUser | null;
}

export type WalletMessageSigner = (message: Uint8Array) => Promise<Uint8Array>;

export interface LoginInput {
  walletAddress: string;
  signMessage: WalletMessageSigner;
}

export interface UpdateProfileInput {
  username: string | null;
  avatarUrl: string | null;
}
