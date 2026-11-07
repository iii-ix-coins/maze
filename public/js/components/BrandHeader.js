'use strict';

(function mountBrandHeader() {
    const target = document.getElementById('site-brand-header');

    if (!target) {
        return;
    }

    target.className = 'site-brand-header-host';

    target.innerHTML = `
        <div id="hold-info" class="brand-header">
            <p class="brand-description">
                Start Maze Mining<br>
                <span>
                    Create or join maze mining rooms 
                </span>
            </p>

        </div>
    `;
})();