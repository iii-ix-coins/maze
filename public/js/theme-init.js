/* Apply the saved theme before the stylesheet is rendered to avoid a flash. */
(() => {
    const allowedThemes = new Set(['grass', 'dark', 'light']);
    let theme = 'grass';

    try {
        const savedTheme = window.localStorage.getItem('hollld-theme');
        if (allowedThemes.has(savedTheme)) {
            theme = savedTheme;
        }
    } catch (_) {
        // Storage can be unavailable in privacy-restricted browser contexts.
    }

    document.documentElement.dataset.theme = theme;
})();
