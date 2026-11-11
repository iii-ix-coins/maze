import { createAppKit } from '@reown/appkit/react';
import { SolanaAdapter } from '@reown/appkit-adapter-solana/react';
import { solana } from '@reown/appkit/networks';

/**
 * Reown AppKit is the wallet-connection transport for the Solana wallet layer.
 *
 * The public Project ID is required for WalletConnect/mobile discovery. The
 * module is safe to import before configuration: the UI renders a clear
 * disabled state until VITE_REOWN_PROJECT_ID is supplied at build time.
 */
const projectId = String(import.meta.env.VITE_REOWN_PROJECT_ID ?? '').trim();

export const isWalletConnectionConfigured = projectId.length > 0;

if (isWalletConnectionConfigured) {
  const appOrigin = (
    String(import.meta.env.VITE_APP_URL ?? '').trim() || window.location.origin
  ).replace(/\/+$/, '');

  createAppKit({
    adapters: [new SolanaAdapter()],
    networks: [solana],
    projectId,
    metadata: {
      name: 'Maze',
      description: 'Maze mining and multiplayer maze game',
      url: appOrigin,
      icons: [`${appOrigin}/css/images/maze-logo-white.svg`],
    },
    features: {
      analytics: false,
      email: false,
      socials: [],
    },
    themeMode: 'dark',
    themeVariables: {
      '--apkt-color-mix': '#78edc0',
      '--apkt-color-mix-strength': 42,
    },
  });
}
