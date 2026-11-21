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

/** Server-issued SIWS fields passed unchanged to a Wallet Standard signIn feature. */
export interface WalletSignInInput {
  domain: string;
  address: string;
  statement: string;
  uri: string;
  version: '1';
  chainId: 'solana:mainnet';
  nonce: string;
  issuedAt: string;
  expirationTime: string;
}

/** The plain-message SIWS output supported by the current Maze verifier. */
export interface WalletSignInOutput {
  account: { address: string };
  signedMessage: Uint8Array;
  signature: Uint8Array;
  signatureType?: string;
  signedMessageFormat?: { kind: string; messageVersion?: number };
}

export type WalletSignIn = (input: WalletSignInInput) => Promise<WalletSignInOutput>;

export interface LoginInput {
  walletAddress: string;
  /** Preferred: one Wallet Standard solana:signIn request. */
  signIn?: WalletSignIn;
  /** Compatibility fallback for providers which only expose signMessage. */
  signMessage?: WalletMessageSigner;
  /** Prevents a delayed signature response from authenticating after wallet disconnect/switch. */
  isWalletConnected?: () => boolean;
}

export interface UpdateProfileInput {
  username: string | null;
  avatarUrl: string | null;
}
