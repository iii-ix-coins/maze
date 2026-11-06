'use strict';

(function mountShareModal() {
    const target = document.getElementById('site-share-modal');

    if (!target) {
        return;
    }

    target.className = 'site-share-modal-host';

    target.innerHTML = `
        <div id="share-modal" class="modal-overlay">

            <div class="modal-box">

                <img
                    src="./css/images/hollld-logo.svg"
                    alt="Hollld Logo"
                    class="popup-img"
                >

                <h3>hollld.fun</h3>

                <p>
                    Share it with your friends!
                </p>

                <div class="copy-box">

                    <input
                        type="text"
                        id="share-url"
                        readonly
                        value="https://hollld.fun"
                    >

                    <button
                        id="btn-copy"
                        class="share-copy-btn"
                        type="button"
                        title="Copy Share Link"
                        aria-label="Copy Share Link"
                    >
                        <img
                            src="./css/images/copy-logo.svg"
                            alt="Copy"
                        >
                    </button>

                </div>

                <button
                    id="btn-close-modal"
                    class="close-modal"
                    type="button"
                >
                    Close
                </button>

            </div>

        </div>
    `;
})();