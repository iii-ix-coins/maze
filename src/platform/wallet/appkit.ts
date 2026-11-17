import { createAppKit } from '@reown/appkit/react';
import { SolanaAdapter } from '@reown/appkit-adapter-solana/react';
import { solana } from '@reown/appkit/networks';

/**
 * Official Reown AppKit initialization for Maze.
 *
 * The AppKit UI intentionally uses Reown's defaults: no themeMode,
 * themeVariables, feature overrides, or custom Shadow DOM styles are applied.
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
  });

  // Keep MazeBackground's existing optimization without changing Reown's UI.
  const root = document.documentElement;
  modal.subscribeState((state) => {
    if (state.open) {
      root.setAttribute('data-wallet-modal', 'open');
    } else {
      root.removeAttribute('data-wallet-modal');
    }
  });

  return modal;
}

/** Created once when the public Project ID is available. */
export const walletModal = isWalletConnectionConfigured ? initWalletModal() : null;
