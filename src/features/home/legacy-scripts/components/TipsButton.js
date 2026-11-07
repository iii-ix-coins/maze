'use strict';

export function createTipsButton() {
    const button = document.createElement('button');

    button.type = 'button';
    button.id = 'btn-tips';
    button.className = 'interact-btn ttips';
    button.title = 'Tips';
    button.setAttribute('aria-label', 'Go to Tips and formulas');

    const image = document.createElement('img');
    image.src = './css/images/tips-logo.svg';
    image.alt = '';
    image.setAttribute('aria-hidden', 'true');

    const label = document.createElement('span');
    label.textContent = 'Tips';

    button.append(image, label);

    button.addEventListener('click', () => {
        const tipsTarget = document.querySelector('.slider-card');

        if (tipsTarget) {
            tipsTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
            tipsTarget.classList.remove('tips-target-highlight');
            // Force a reflow so repeated clicks can replay the highlight.
            void tipsTarget.offsetWidth;
            tipsTarget.classList.add('tips-target-highlight');
            window.setTimeout(() => {
                tipsTarget.classList.remove('tips-target-highlight');
            }, 1400);
            return;
        }

        // Allows a page-specific Tips panel to respond if one is added later.
        document.dispatchEvent(new CustomEvent('maze:tips-open'));
    });

    return button;
}
