/**
 * Tiny DOM helpers for the lobby. Text always goes through text nodes, never innerHTML, because room and player
 * names come from other people. `html` is only for the static icon strings in icons.js.
 */
export function h(tag, props?, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
        if (value == null || value === false) continue;
        if (key === 'class') el.className = value;
        else if (key === 'dataset') Object.assign(el.dataset, value);
        else if (key === 'style') el.style.cssText = value;
        else if (key === 'html') el.innerHTML = value;
        else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
        else el.setAttribute(key, value === true ? '' : String(value));
    }
    for (const child of children.flat(Infinity)) {
        if (child == null || child === false) continue;
        el.append(child.nodeType ? child : document.createTextNode(String(child)));
    }
    return el;
}

export const plural = (n, one, many) => (n === 1 ? one : many);

/** Sets text only when it changed, so rolling updates don't churn the DOM or re-announce to screen readers. */
export function setText(el, text) {
    const next = String(text);
    if (el && el.textContent !== next) el.textContent = next;
}

/** First visible letter of a name, for avatars. */
export function initialOf(name) {
    const match = String(name || '').trim().match(/\p{L}|\p{N}/u);
    return match ? match[0].toUpperCase() : '?';
}

/** Runs `fn` at most once per animation frame, however often it is called. */
export function frameThrottle(fn) {
    let queued = false;
    return (...args) => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => { queued = false; fn(...args); });
    };
}
