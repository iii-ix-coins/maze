const MODAL_HOST = /^(w3m|appkit)-modal$/;
const STYLE_MARKERS = {
  font: 'data-maze-wallet-font',
  modal: 'data-maze-wallet-visuals',
} as const;

/**
 * Typography override for Reown's nested open Shadow DOM roots.
 * AppKit 1.8.24 exposes the base font theme variable, but some mono components
 * still use an internal hard-coded font family. This keeps every visible text
 * element on Montserrat without changing component colors or surfaces.
 */
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
 * These rules are added only to the outer AppKit modal ShadowRoot.
 * The glow is a pseudo-element behind the modal/backdrop, not a text-shadow or
 * a shadow on buttons/cards. Its color follows Maze's --ar-rgb theme token.
 */
const MODAL_VISUALS_CSS = `
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
    ellipse 70% 72% at 50% 50%,
    rgba(var(--ar-rgb, 34, 229, 255), .20) 0%,
    rgba(var(--ar-rgb, 34, 229, 255), .10) 36%,
    rgba(var(--ar-rgb, 34, 229, 255), .025) 60%,
    transparent 78%
  );
}

/* Preserve Reown's native mobile layout; center the desktop card precisely. */
@media (min-width: 640px) {
  wui-card {
    position: fixed !important;
    inset-block-start: 50% !important;
    inset-inline-start: 50% !important;
    translate: -50% -50%;
    max-block-size: calc(100dvh - 32px);
    z-index: 2;
  }
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
    if (isModalRoot) appendStyle(root, STYLE_MARKERS.modal, MODAL_VISUALS_CSS);
    styledRoots.add(root);
  } else if (isModalRoot) {
    appendStyle(root, STYLE_MARKERS.modal, MODAL_VISUALS_CSS);
  }

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

function scanElement(element: Element, attempts = 20): void {
  if (element.shadowRoot) {
    adoptShadowRoot(element.shadowRoot);
    return;
  }

  // Reown custom elements can be upgraded just after they are inserted.
  if (attempts > 0 && element.localName.includes('-')) {
    window.requestAnimationFrame(() => scanElement(element, attempts - 1));
  }
}

function installOnHost(host: Element, attempts = 30): void {
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
