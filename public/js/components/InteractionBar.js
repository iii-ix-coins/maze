'use strict';

import { createTipsButton } from './TipsButton.js';
(function mountInteractionBar() {
    const target =
        document.getElementById(
            'site-interaction-bar'
        );

    if (!target) {
        return;
    }

    target.className =
        'site-interaction-bar-host';

    target.innerHTML = `
        <div class="interaction-bar">

            <!-- Tips -->
            <div class="interaction-bar__tips-slot" data-tips-button-slot></div>

            <!-- Views -->

            <div
                class="interact-btn view-only tview"
                title="Views"
            >
                <img
                    src="./css/images/view-logo.svg"
                    alt="Views"
                >

                <span
                    id="view-count"
                    title="Views"
                >
                    0
                </span>
            </div>


            <!-- Likes -->

            <button
                id="btn-like"
                class="interact-btn tlike"
                type="button"
                title="Likes"
            >
                <img
                    src="./css/images/like-logo.svg"
                    alt="Likes"
                >

                <span
                    id="like-count"
                    title="Likes"
                >
                    0
                </span>
            </button>


            <!-- Shares -->

            <button
                id="btn-share"
                class="interact-btn tshare"
                type="button"
                title="Share"
            >
                <img
                    src="./css/images/share-logo.svg"
                    alt="Share"
                >

                <span
                    id="share-count"
                    title="Shares"
                >
                    0
                </span>
            </button>

        </div>
    `;
    const tipsSlot = target.querySelector('[data-tips-button-slot]');
    if (tipsSlot) {
        tipsSlot.append(createTipsButton());
    }
})();