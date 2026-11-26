import { createAppKit } from '@reown/appkit/react';
import { SolanaAdapter } from '@reown/appkit-adapter-solana/react';
import { solana } from '@reown/appkit/networks';
import { installWalletModalVisuals } from './walletModalVisuals';

/**
 * Official Reown AppKit initialization for Maze.
 * The AppKit UI keeps Reown's default theme and components, with two small
 * presentation preferences: the site's Nunito font and a theme-colored
 * ambient glow behind the modal.
 *
 * Domain handling: metadata.url always matches the actual serving origin.
 * Every host that serves the site must also be listed in the Reown Dashboard
 * allowed-domain list.
 */
const projectId = String(import.meta.env.VITE_REOWN_PROJECT_ID ?? '').trim();

export const isWalletConnectionConfigured = projectId.length > 0;

function initWalletModal() {
  const appOrigin = window.location.origin;

  const modal = createAppKit({
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
    // Reown's theme mode remains at its default: follow the user's system.
    // Only the base font is overridden; all other AppKit theme values remain default.
    themeVariables: {
      '--apkt-font-family': 'Nunito, sans-serif',
    },
  });

  // Keep MazeBackground's existing optimization without changing Reown's UI flow.
  const root = document.documentElement;
  modal.subscribeState((state) => {
    if (state.open) {
      root.setAttribute('data-wallet-modal', 'open');
    } else {
      root.removeAttribute('data-wallet-modal');
    }
  });

  // Narrow visual polish only: modal centering and the backdrop glow.
  installWalletModalVisuals();

  return modal;
}

/** Created once when the public Project ID is available. */
export const walletModal = isWalletConnectionConfigured ? initWalletModal() : null;
