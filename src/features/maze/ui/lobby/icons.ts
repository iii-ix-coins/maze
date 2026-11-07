/** Inline SVG icons (stroke = currentColor) for the lobby. Static strings only; safe for `html:`. */
const svg = body => `<svg class="lb-ic" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

export const ICONS = {
    grid: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 12h8V8h8M12 12v8"/>'),
    target: svg('<path d="M12 3l7 9-7 9-7-9z"/>'),
    clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
    users: svg('<circle cx="9" cy="9" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9.8" r="2.4"/><path d="M16.5 14.2c2.3.2 3.7 1.7 4.2 4.2"/>'),
    eye: svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>'),
    flag: svg('<path d="M6 21V4"/><path d="M6 5h11l-2.2 3.6L17 12H6"/>'),
    copy: svg('<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6A2.5 2.5 0 0 0 13 3.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5"/>'),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    search: svg('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>'),
    leave: svg('<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 8l-4 4 4 4M6 12h10"/>'),
    play: svg('<path d="M8 5.5v13l11-6.5z"/>'),
    bolt: svg('<path d="M13 3L5.5 13.5H11L10 21l7.5-10.5H12z"/>'),
    crown: svg('<path d="M4 17.5l-1-9 5 3.5L12 5l4 7 5-3.5-1 9z"/><path d="M5 20.5h14"/>'),
    server: svg('<rect x="3.5" y="4" width="17" height="6.5" rx="2"/><rect x="3.5" y="13.5" width="17" height="6.5" rx="2"/><path d="M7.5 7.2h.01M7.5 16.7h.01"/>'),
    link: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 5.3l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/>'),
    back: svg('<path d="M19 12H5M11 6l-6 6 6 6"/>')
};
