const MODAL_HOST = /^(w3m|appkit)-modal$/;
const STYLE_MARKERS = {
  font: 'data-maze-wallet-font',
  parts: 'data-maze-wallet-modal-parts',
  root: 'data-maze-wallet-modal-root',
} as const;

/** Keep Maze typography in every open Reown Shadow DOM root. */
const FONT_CSS = `
:host,
:host *,
::slotted(*),
*::before,
*::after {
  font-family: "Montserrat", sans-serif !important;
}
`;

/**
 * Rules for elements rendered in nested Reown roots.
 * Reown 1.8.x places the card/overlay below more than one Shadow DOM root,
 * so these rules must be installed in every open root under the modal host.
 */
const MODAL_PARTS_CSS = `
:host {
  --w3m-overlay-background-color: rgba(var(--ar-rgb, 34, 229, 255), .16);
  --apkt-overlay-background-color: rgba(var(--ar-rgb, 34, 229, 255), .16);
}

/* The backdrop tint is deliberately distinct from the wider ambient glow. */
w3m-overlay,
wui-overlay,
.w3m-overlay,
[part="overlay"] {
  background-color: rgba(var(--ar-rgb, 34, 229, 255), .16) !important;
  background-image: none !important;
  backdrop-filter: blur(7px);
  -webkit-backdrop-filter: blur(7px);
}

/* Center the actual Reown card in the viewport at every breakpoint. */
wui-card {
  position: fixed !important;
  inset-block-start: 50% !important;
  inset-inline-start: 50% !important;
  inset-block-end: auto !important;
  inset-inline-end: auto !important;
  margin: 0 !important;
  translate: -50% -50% !important;
  max-block-size: calc(100dvh - 24px) !important;
  max-inline-size: calc(100vw - 24px) !important;
  overflow: auto;
}
`;

/** Ambient halo behind the complete modal layer; intentionally stronger and wider. */
const MODAL_ROOT_CSS = `
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
    rgba(var(--ar-rgb, 34, 229, 255), .34) 0%,
    rgba(var(--ar-rgb, 34, 229, 255), .19) 34%,
    rgba(var(--ar-rgb, 34, 229, 255), .06) 60%,
    transparent 80%
  );
}
`;

const styledRoots = new WeakSet<ShadowRoot>();
const watchedRoots = new WeakSet<ShadowRoot>();
let installed = false;

function appendStyle(root: ShadowRoot, marker: string, css: string): void {
  if (root.querySelector(`style[${marker}]`)) return;
  const style = document.createElement('style');
  style.setAttribute(marker, '');
  style.textContent = css;
  root.appendChild(style);
}

function adoptShadowRoot(root: ShadowRoot, isModalRoot = false): void {
  if (!styledRoots.has(root)) {
    appendStyle(root, STYLE_MARKERS.font, FONT_CSS);
    appendStyle(root, STYLE_MARKERS.parts, MODAL_PARTS_CSS);
    styledRoots.add(root);
  }
  if (isModalRoot) appendStyle(root, STYLE_MARKERS.root, MODAL_ROOT_CSS);

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

  root.querySelectorAll('*').forEach((element) => scanElement(element));
}

function scanElement(element: Element, attempts = 30): void {
  if (element.shadowRoot) {
    adoptShadowRoot(element.shadowRoot);
    return;
  }

  // Reown custom elements can be upgraded just after insertion.
  if (attempts > 0 && element.localName.includes('-')) {
    window.requestAnimationFrame(() => scanElement(element, attempts - 1));
  }
}

function installOnHost(host: Element, attempts = 40): void {
  if (!MODAL_HOST.test(host.localName)) return;

  if (host.shadowRoot) {
    adoptShadowRoot(host.shadowRoot, true);
    return;
  }

  if (attempts > 0) {
    window.requestAnimationFrame(() => installOnHost(host, attempts - 1));
  }
}

function scan(node: ParentNode): void {
  if (node instanceof Element) {
    if (MODAL_HOST.test(node.localName)) installOnHost(node);
    else scanElement(node);
  }
  node.querySelectorAll?.('w3m-modal, appkit-modal').forEach((host) => installOnHost(host));
}

/** Installs one observer for AppKit modal hosts created at runtime. */
export function installWalletModalVisuals(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  const start = () => {
    if (!document.body) return;
    scan(document.body);

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (node instanceof Element) scan(node);
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  };

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
}
