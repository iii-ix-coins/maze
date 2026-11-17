const MODAL_HOST = /^(w3m|appkit)-modal$/;

const SKIN_CSS = `
wui-card {
  --wallet-c: var(--wallet-cut, 18px);
  border-radius: 0;
  background-color: transparent;
  background-image:
    linear-gradient(var(--wallet-modal-overlay, rgba(5, 11, 9, .8)), var(--wallet-modal-overlay, rgba(5, 11, 9, .8))),
    var(--wallet-modal-bg-image, none);
  background-size: cover, var(--wallet-modal-bg-size, 240%);
  background-position: center, var(--wallet-modal-bg-position, center);
  box-shadow: inset 0 0 0 1px var(--wallet-modal-line, rgba(182, 255, 46, .3));
  clip-path: polygon(0 0, calc(100% - var(--wallet-c)) 0, 100% var(--wallet-c), 100% 100%, var(--wallet-c) 100%, 0 calc(100% - var(--wallet-c)));
}
wui-list-item, wui-list-wallet, wui-button, wui-input-text, wui-search-bar, wui-card-select, wui-chip-button {
  --wallet-c-sm: var(--wallet-cut-sm, 8px);
  border-radius: 0;
  clip-path: polygon(var(--wallet-c-sm) 0, 100% 0, 100% calc(100% - var(--wallet-c-sm)), calc(100% - var(--wallet-c-sm)) 100%, 0 100%, 0 var(--wallet-c-sm));
}
wui-icon-box, wui-icon-link {
  --wallet-c-xs: 5px;
  border-radius: 0;
  clip-path: polygon(var(--wallet-c-xs) 0, 100% 0, 100% calc(100% - var(--wallet-c-xs)), calc(100% - var(--wallet-c-xs)) 100%, 0 100%, 0 var(--wallet-c-xs));
}
`;

const adopted = new WeakSet<ShadowRoot>();
const watched = new WeakSet<Node>();
let sharedSheet: CSSStyleSheet | null | undefined;
let installed = false;

/** Constructable stylesheets need Safari 16.4+; older browsers get a <style> element. */
function getSheet(): CSSStyleSheet | null {
    if (sharedSheet !== undefined) return sharedSheet;
    try {
        if ('adoptedStyleSheets' in Document.prototype && 'replaceSync' in CSSStyleSheet.prototype) {
            const sheet = new CSSStyleSheet();
            sheet.replaceSync(SKIN_CSS);
            sharedSheet = sheet;
            return sheet;
        }
    } catch {
        // fall through to the <style> fallback
    }
    sharedSheet = null;
    return null;
}

function scan(parent: ParentNode): void {
    parent.querySelectorAll('*').forEach((element) => {
        if (element.shadowRoot) skinShadowRoot(element.shadowRoot);
    });
}

function watch(root: Node): void {
    if (watched.has(root)) return;
    watched.add(root);
    new MutationObserver((records) => {
        for (const record of records) {
            record.addedNodes.forEach((node) => {
                if (!(node instanceof Element)) return;
                if (node.shadowRoot) skinShadowRoot(node.shadowRoot);
                scan(node);
            });
        }
    }).observe(root, { childList: true, subtree: true });
}

function skinShadowRoot(root: ShadowRoot): void {
    if (adopted.has(root)) return;
    adopted.add(root);
    const sheet = getSheet();
    if (sheet) {
        root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
    } else {
        const style = document.createElement('style');
        style.setAttribute('data-wallet-skin', '');
        style.textContent = SKIN_CSS;
        root.appendChild(style);
    }
    watch(root);
    scan(root);
}

/** The host may be upgraded after insertion; retry for a few frames until its shadow root exists. */
function adoptHost(element: Element, attempts = 30): void {
    if (!MODAL_HOST.test(element.localName)) return;
    if (element.shadowRoot) {
        skinShadowRoot(element.shadowRoot);
        return;
    }
    if (attempts > 0) window.requestAnimationFrame(() => adoptHost(element, attempts - 1));
}

export function installWalletModalSkin(): void {
    if (installed || typeof document === 'undefined') return;
    installed = true;
    const start = () => {
        Array.from(document.body.children).forEach((element) => adoptHost(element));
        new MutationObserver((records) => {
            for (const record of records) {
                record.addedNodes.forEach((node) => {
                    if (node instanceof Element) adoptHost(node);
                });
            }
        }).observe(document.body, { childList: true });
    };
    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start, { once: true });
}
