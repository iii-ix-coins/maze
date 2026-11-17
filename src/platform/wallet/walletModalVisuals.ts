const MODAL_HOST = /^(w3m|appkit)-modal$/;
const STYLE_MARKERS = {
  font: 'data-maze-wallet-font',
  desktop: 'data-maze-wallet-desktop-layout',
  root: 'data-maze-wallet-modal-root',
} as const;

const FONT_CSS = `
:host,
:host *,
::slotted(*),
*::before,
*::after {
  font-family: "Montserrat", sans-serif !important;
}
`;

/*
 * Do not override the mobile card positioning: AppKit's native bottom-sheet
 * layout and slide-up transition must remain in control below 640px.
 */
const DESKTOP_LAYOUT_CSS = ` {
  wui-card {
    position: fixed !important;
    inset: 50% auto auto 50% !important;
    margin: 0 !important;
    translate: -50% -50% !important;
    width: min(400px, calc(100vw - 32px)) !important;
    max-width: 400px !important;
    max-inline-size: min(400px, calc(100vw - 32px)) !important;
    max-block-size: calc(100dvh - 32px) !important;
  }
}
`;


/* A separate, wider ambient halo. It does not cast shadows on card contents. */
const ROOT_GLOW_CSS = `
:host {
  isolation: isolate;
}
:host::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background: radial-gradient(
    ellipse 76% 78% at 50% 50%,
    rgba(var(--maze-wallet-rgb, 34, 229, 255), .34) 0%,
    rgba(var(--maze-wallet-rgb, 34, 229, 255), .18) 38%,
    rgba(var(--maze-wallet-rgb, 34, 229, 255), .05) 64%,
    transparent 82%
  );
}
`;

const styledRoots = new WeakSet<ShadowRoot>();
const watchedRoots = new WeakSet<ShadowRoot>();
let installed = false;

function readAccent(): { rgb: string; overlay: string } {
  const styles = window.getComputedStyle(document.documentElement);
  const rgbToken = styles.getPropertyValue('--ar-rgb').trim();
  if (rgbToken) return { rgb: rgbToken, overlay: `rgba(${rgbToken}, .24)` };

  const accent = styles.getPropertyValue('--ar-accent').trim();
  const match = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(accent);
  if (match) {
    const hex = match[1].length === 3
      ? match[1].split('').map((part) => part + part).join('')
      : match[1];
    const rgb = [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16)).join(', ');
    return { rgb, overlay: `rgba(${rgb}, .24)` };
  }

  return { rgb: '34, 229, 255', overlay: 'rgba(34, 229, 255, .24)' };
}

function applyThemeTokens(): void {
  const { rgb, overlay } = readAccent();
  const host = document.querySelector('w3m-modal, appkit-modal');
  if (host instanceof HTMLElement) {
    host.style.setProperty('--maze-wallet-rgb', rgb);
    host.style.setProperty('--maze-wallet-overlay', overlay);
  }
}

function appendStyle(root: ShadowRoot, marker: string, css: string): void {
  if (root.querySelector(`style[${marker}]`)) return;
  const style = document.createElement('style');
  style.setAttribute(marker, '');
  style.textContent = css;
  root.appendChild(style);
}



function scanElement(element: Element): void {
  if (element.shadowRoot) adoptShadowRoot(element.shadowRoot);
}

function adoptShadowRoot(root: ShadowRoot, isModalRoot = false): void {
  if (!styledRoots.has(root)) {
    appendStyle(root, STYLE_MARKERS.font, FONT_CSS);
    appendStyle(root, STYLE_MARKERS.desktop, DESKTOP_LAYOUT_CSS);
    styledRoots.add(root);
  }
  if (isModalRoot) appendStyle(root, STYLE_MARKERS.root, ROOT_GLOW_CSS);


  if (!watchedRoots.has(root)) {
    watchedRoots.add(root);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (node instanceof Element) scanElement(node);
        });
      }
    });
    observer.observe(root, { childList: true, subtree: true });
  }

  root.querySelectorAll('*').forEach(scanElement);
}

function installOnHost(host: Element, attempts = 40): void {
  if (!MODAL_HOST.test(host.localName)) return;
  if (host.shadowRoot) {
    adoptShadowRoot(host.shadowRoot, true);
    applyThemeTokens();
    return;
  }
  if (attempts > 0) window.requestAnimationFrame(() => installOnHost(host, attempts - 1));
}

function scan(node: ParentNode): void {
  if (node instanceof Element) {
    if (MODAL_HOST.test(node.localName)) installOnHost(node);
    else scanElement(node);
  }
  node.querySelectorAll?.('w3m-modal, appkit-modal').forEach((host) => installOnHost(host));
}

/** Installs Maze's limited visual preferences without replacing Reown's UI. */
export function installWalletModalVisuals(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  const start = () => {
    if (!document.body) return;
    applyThemeTokens();
    scan(document.body);

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (node instanceof Element) scan(node);
        });
      }
      applyThemeTokens();
    });
    observer.observe(document.body, { childList: true, subtree: true });

  };

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
}
