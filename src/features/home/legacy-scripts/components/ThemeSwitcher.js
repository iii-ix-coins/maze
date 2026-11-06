'use strict';

import { initMazeBackground } from './MazeBackground.js';

// Keep the legacy key readable so existing visitors retain their saved theme.
const THEME_KEY = 'maze-theme';
const LEGACY_THEME_KEY = 'hollld-theme';
const THEMES = ['grass', 'dark', 'light'];
const THEME_LABELS = {
    grass: 'Grass',
    dark: 'Dark',
    light: 'Light'
};

// One stroke icon per theme (24x24 viewBox, drawn with currentColor).
const THEME_ICONS = {
    grass: new URL('../../css/images/theme-grass.svg', import.meta.url).href,
    dark: new URL('../../css/images/theme-dark.svg', import.meta.url).href,
    light: new URL('../../css/images/theme-light.svg', import.meta.url).href
};

function normalizeTheme(theme) {
    return THEMES.includes(theme) ? theme : 'grass';
}

function readSavedTheme() {
    try {
        return normalizeTheme(
            window.localStorage.getItem(THEME_KEY) ||
            window.localStorage.getItem(LEGACY_THEME_KEY) ||
            document.documentElement.dataset.theme
        );
    } catch (_) {
        return normalizeTheme(document.documentElement.dataset.theme);
    }
}

function applyTheme(theme, { persist = true } = {}) {
    const selectedTheme = normalizeTheme(theme);
    document.documentElement.dataset.theme = selectedTheme;

    if (persist) {
        try {
            window.localStorage.setItem(THEME_KEY, selectedTheme);
            // Keep the old key in sync during the transition for other existing code.
            window.localStorage.setItem(LEGACY_THEME_KEY, selectedTheme);
        } catch (_) {
            // The current page still changes theme if storage is unavailable.
        }
    }

    window.dispatchEvent(new CustomEvent('site:themechange', {
        detail: { theme: selectedTheme }
    }));

    return selectedTheme;
}

export function createThemeSwitcher() {
    initMazeBackground();

    // Segmented 3-state control: [grass | dark | light] with a sliding thumb.
    const root = document.createElement('div');
    root.className = 'theme-toggle';
    root.setAttribute('role', 'radiogroup');
    root.setAttribute('aria-label', 'Background theme');
    root.innerHTML = `
    <span class="theme-toggle__thumb" aria-hidden="true"></span>

    ${THEMES.map(theme => `
        <button
            class="theme-toggle__option"
            type="button"
            role="radio"
            aria-checked="false"
            aria-label="${THEME_LABELS[theme]} theme"
            title="${THEME_LABELS[theme]}"
            data-select-theme="${theme}"
            tabindex="-1"
        >
            <img
                class="theme-toggle__icon"
                src="${THEME_ICONS[theme]}"
                alt=""
                aria-hidden="true"
                draggable="false"
            >
        </button>
    `).join('')}
`;

    const options = Array.from(root.querySelectorAll('[data-select-theme]'));

    function render(theme = document.documentElement.dataset.theme) {
        const selectedTheme = normalizeTheme(theme);
        root.dataset.theme = selectedTheme;
        root.style.setProperty('--theme-index', String(THEMES.indexOf(selectedTheme)));

        for (const option of options) {
            const active = option.dataset.selectTheme === selectedTheme;
            option.classList.toggle('is-active', active);
            option.setAttribute('aria-checked', String(active));
            option.tabIndex = active ? 0 : -1;
        }
    }

    function select(theme, { focus = false } = {}) {
        render(applyTheme(theme));
        if (focus) {
            options.find(o => o.dataset.selectTheme === root.dataset.theme)?.focus();
        }
    }

    for (const option of options) {
        option.addEventListener('click', () => select(option.dataset.selectTheme));
    }

    // Radio-group keyboard support: arrows move + select, Home/End jump.
    root.addEventListener('keydown', event => {
        const current = THEMES.indexOf(root.dataset.theme);
        let next = null;

        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (current + 1) % THEMES.length;
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (current - 1 + THEMES.length) % THEMES.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = THEMES.length - 1;

        if (next === null) return;
        event.preventDefault();
        select(THEMES[next], { focus: true });
    });

    window.addEventListener('storage', event => {
        if (event.key !== THEME_KEY && event.key !== LEGACY_THEME_KEY) return;
        render(applyTheme(event.newValue || 'grass', { persist: false }));
    });

    // Restore saved preference, migrate legacy storage, and notify background listeners.
    const savedTheme = readSavedTheme();
    applyTheme(savedTheme);
    render(savedTheme);

    return root;
}
