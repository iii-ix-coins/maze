"use strict";

const VIEWS = ['create', 'rooms', 'live'];
const VIEW_LABELS = {
    create: 'Create',
    rooms: 'Rooms',
    live: 'Live'
};

const VIEW_ICONS = {
    create: `<img class="theme-toggle__icon" src="../../css/images/create.svg">`,
    rooms:  `<img class="theme-toggle__icon" src="../../css/images/rooms.svg">`,
    live: `<img class="theme-toggle__icon" src="../../css/images/live.svg">`
};

function normalizeView(view) {
    return VIEWS.includes(view) ? view : 'create';
}

function readCurrentView() {
    try {
        const path = window.location.pathname.toLowerCase();
        const isMazeRoute = path.endsWith('/maze.html') || path === '/maze.html' || path.endsWith('/play') || path.endsWith('/play/');
        if (!isMazeRoute) return 'create';
        return normalizeView(new URLSearchParams(window.location.search).get('view'));
    } catch (_) {
        return 'create';
    }
}

export function createGameViewSwitcher() {
    const root = document.createElement('div');
    root.className = 'theme-toggle game-view-toggle';
    root.setAttribute('role', 'radiogroup');
    root.setAttribute('aria-label', 'Maze sections');
    root.innerHTML = `
        <span class="theme-toggle__thumb" aria-hidden="true"></span>
        ${VIEWS.map(view => `
            <button
                class="theme-toggle__option game-view-toggle__option"
                type="button"
                role="radio"
                aria-checked="false"
                aria-label="${VIEW_LABELS[view]}"
                title="${VIEW_LABELS[view]}"
                data-select-view="${view}"
                tabindex="-1"
            >${VIEW_ICONS[view]}</button>
            
        `).join('')}
    `;

    const options = Array.from(root.querySelectorAll('[data-select-view]'));

    function render(view = readCurrentView()) {
        const selected = normalizeView(view);
        root.dataset.view = selected;
        root.style.setProperty('--theme-index', String(VIEWS.indexOf(selected)));
        for (const option of options) {
            const active = option.dataset.selectView === selected;
            option.classList.toggle('is-active', active);
            option.setAttribute('aria-checked', String(active));
            option.tabIndex = active ? 0 : -1;
        }
    }

    function navigate(view, { focus = false } = {}) {
        const selected = normalizeView(view);
        render(selected);
        if (focus) options.find(option => option.dataset.selectView === selected)?.focus();
        const url = new URL('./maze.html', document.baseURI);
        url.searchParams.set('view', selected);
        window.location.assign(url.href);
    }

    for (const option of options) {
        option.addEventListener('click', () => navigate(option.dataset.selectView));
    }

    root.addEventListener('keydown', event => {
        const current = VIEWS.indexOf(root.dataset.view);
        let next = null;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (current + 1) % VIEWS.length;
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (current - 1 + VIEWS.length) % VIEWS.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = VIEWS.length - 1;
        if (next === null) return;
        event.preventDefault();
        navigate(VIEWS[next], { focus: true });
    });

    render();
    return root;
}
