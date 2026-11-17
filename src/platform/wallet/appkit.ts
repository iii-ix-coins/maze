import { createAppKit } from '@reown/appkit/react';
import { SolanaAdapter } from '@reown/appkit-adapter-solana/react';
import { solana } from '@reown/appkit/networks';
import { normalizeSiteTheme, type SiteTheme } from '../../features/theme/theme';

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
      '--apkt-border-radius-master': '2px',
    },
  };
}

if (isWalletConnectionConfigured) {
  const appOrigin = window.location.origin;
  const initialTheme = getWalletTheme(normalizeSiteTheme(document.documentElement.dataset.theme));

  createAppKit({
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
}
