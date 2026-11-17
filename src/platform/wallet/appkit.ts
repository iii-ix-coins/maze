import { createAppKit } from '@reown/appkit/react';
import { SolanaAdapter } from '@reown/appkit-adapter-solana/react';
import { solana } from '@reown/appkit/networks';
import { normalizeSiteTheme, type SiteTheme } from '../../features/theme/theme';
import { installWalletModalSkin } from './walletModalSkin';

/**
 * Reown AppKit is the wallet-connection transport for the Solana wallet layer.
 *
 * The public Project ID is required for WalletConnect/mobile discovery. The
 * module is safe to import before configuration: the UI renders a clear
 * disabled state until VITE_REOWN_PROJECT_ID is supplied at build time.
 *
 * Domain handling: `metadata.url` is always the origin the page is actually
 * served from. WalletConnect/Reown compare it with the browser origin and with
 * the dashboard allowlist, so a fixed env value (e.g. hollld.fun) breaks the
 * connection on every other host (e.g. *.up.railway.app). Every host that serves
 * the site must be listed in the Reown Dashboard allowlist.
 */
const projectId = String(import.meta.env.VITE_REOWN_PROJECT_ID ?? '').trim();

export const isWalletConnectionConfigured = projectId.length > 0;

/** Used only when a CSS token cannot be read; values mirror arena.css. */
const FALLBACK_PALETTE: Record<SiteTheme, { accent: string; surface: string }> = {
  grass: { accent: '#b6ff2e', surface: '#050b09' },
  dark: { accent: '#22e5ff', surface: '#070810' },
  light: { accent: '#6a2cff', surface: '#f2eee3' },
};

/** Low strength: tint the modal surfaces toward the page background, not a neon wash. */
const SURFACE_MIX_STRENGTH = 14;

function readToken(name: string): string {
  try {
    return window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  } catch {
    return '';
  }
}

/**
 * AppKit theme derived from the site's own design tokens (--ar-accent / --ar-bg),
 * so the modal follows grass / dark / light without a second palette to maintain.
 */
export function getWalletTheme(theme: SiteTheme) {
  const fallback = FALLBACK_PALETTE[theme];
  return {
    themeMode: theme === 'light' ? ('light' as const) : ('dark' as const),
    themeVariables: {
      '--apkt-accent': readToken('--ar-accent') || fallback.accent,
      '--apkt-color-mix': readToken('--ar-bg') || fallback.surface,
      '--apkt-color-mix-strength': SURFACE_MIX_STRENGTH,
      '--apkt-font-family': 'Montserrat, system-ui, sans-serif',
      '--apkt-border-radius-master': '0px', // corners are chamfered by walletModalSkin, not rounded
    },
  };
}

/** Last theme pushed to AppKit; identical themes are never re-applied. */
let appliedThemeKey = '';

function initWalletModal() {
  const appOrigin = window.location.origin;
  const initialTheme = getWalletTheme(normalizeSiteTheme(document.documentElement.dataset.theme));
  appliedThemeKey = JSON.stringify(initialTheme);

  const modal = createAppKit({
    adapters: [new SolanaAdapter()],
    networks: [solana],
    defaultNetwork: solana,
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
    themeMode: initialTheme.themeMode,
    themeVariables: initialTheme.themeVariables,
  });

  installWalletModalSkin();

  // Expose "modal is open" to CSS/JS (e.g. MazeBackground pauses its per-frame work).
  const root = document.documentElement;
  modal.subscribeState((state) => {
    if (state.open) root.setAttribute('data-wallet-modal', 'open');
    else root.removeAttribute('data-wallet-modal');
  });

  return modal;
}

/** Created once, at module evaluation; null when no Project ID is configured. */
export const walletModal = isWalletConnectionConfigured ? initWalletModal() : null;

/**
 * Imperative theme sync. Deliberately NOT done with the `useAppKitTheme` hook:
 * that hook subscribes the component to the very store it writes to, so a
 * set-in-effect can feed back into itself. Here nothing re-renders, and an
 * unchanged theme is a no-op.
 */
export function applyWalletTheme(theme: SiteTheme): void {
  if (!walletModal) return;
  const next = getWalletTheme(theme);
  const key = JSON.stringify(next);
  if (key === appliedThemeKey) return;
  appliedThemeKey = key;
  walletModal.setThemeMode(next.themeMode);
  walletModal.setThemeVariables(next.themeVariables);
}
