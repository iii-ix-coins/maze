'use strict';
(function mountHoldersBox() {
    const target = document.getElementById('site-holders-box');
    if (!target) {
        return;
    }
    target.className = 'site-holders-box-host';
    target.innerHTML = `
        <section class="holders-box" aria-label="Token holders">
            <div class="holders-header">
                <div class="holders-title">
                    <span>Holders</span>
                    <span id="holders-count" class="holders-count">
                        ex.100K
                    </span>
                </div>
            </div>
            <div class="holders-content">
                <div class="holders-columns" aria-hidden="true">
                    <span>#</span>
                    <span>Wallet</span>
                    <span>Holding</span>
                    <span>Buys</span>
                    <span>Last buy</span>
                </div>
                <div id="holders-list" class="holders-list">
                </div>
            </div>
        </section>
    `;
})();