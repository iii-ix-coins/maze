const MODAL_HOST = /^(w3m|appkit)-modal$/;

const SKIN_CSS = `
wui-card {
  --wallet-c: var(--wallet-cut, 18px);
  border-radius: 0;
  background-color: transparent;
  background-image:
    linear-gradient(var(--wallet-modal-overlay, rgba(5, 11, 9, .45)), var(--wallet-modal-overlay, rgba(5, 11, 9, .45))),
    var(--wallet-modal-bg-image, none);
  background-size: cover, var(--wallet-modal-bg-size, 900px);
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
        refreshWalletModalSkin();
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

/* ---- Guard: an opaque inner layer would hide the card background ---- */

const COVER_RATIO = 0.8;
const cleared = new WeakSet<Element>();
let refreshTimer = 0;

/** True when a computed color is visibly painted (alpha >= .5). */
function isPainted(color: string): boolean {
    if (!color || color === 'transparent') return false;
    const legacy = /^rgba?\(([^)]+)\)$/.exec(color);
    if (legacy) {
        const parts = legacy[1].split(/[\s,/]+/).filter(Boolean);
        return parts.length < 4 || Number(parts[3]) >= 0.5;
    }
    const modern = /\/\s*([\d.]+%?)\s*\)$/.exec(color);
    if (modern) {
        const alpha = modern[1].endsWith('%') ? Number.parseFloat(modern[1]) / 100 : Number(modern[1]);
        return alpha >= 0.5;
    }
    return true;
}

function findModalCard(): Element | null {
    for (const element of Array.from(document.body.children)) {
        if (MODAL_HOST.test(element.localName) && element.shadowRoot) {
            const card = element.shadowRoot.querySelector('wui-card');
            if (card) return card;
        }
    }
    return null;
}

/**
 * Any inner element that covers most of the card with an opaque background would
 * sit on top of the image. Make those transparent so the card background shows.
 */
function clearOpaqueLayers(card: Element): void {
    const cardRect = card.getBoundingClientRect();
    const cardArea = cardRect.width * cardRect.height;
    if (cardArea === 0) return;
    const visit = (parent: ParentNode) => {
        parent.querySelectorAll('*').forEach((element) => {
            if (element instanceof HTMLElement && !cleared.has(element)) {
                const rect = element.getBoundingClientRect();
                if (rect.width * rect.height >= cardArea * COVER_RATIO && isPainted(window.getComputedStyle(element).backgroundColor)) {
                    element.style.setProperty('background-color', 'transparent', 'important');
                    cleared.add(element);
                }
            }
            if (element.shadowRoot) visit(element.shadowRoot);
        });
    };
    visit(card);
    if (card.shadowRoot) visit(card.shadowRoot);
}

/** Debounced; call when the modal opens or its content changes. */
export function refreshWalletModalSkin(): void {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
        const card = findModalCard();
        if (card) clearOpaqueLayers(card);
    }, 120);
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
