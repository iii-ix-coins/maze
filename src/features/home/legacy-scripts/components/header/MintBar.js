'use strict';
function createMintAddress() {
    const container =
        document.createElement('div');
    container.className =
        'mint-box';
    container.innerHTML = `
        <span
            id="mint-address-value"
            class="mint-address-value"
            title="Mint Address"
        ></span>
        <button
            id="btn-copy-mint"
            class="mint-copy-btn"
            type="button"
            title="Copy Mint Address"
            aria-label="Copy Mint Address"
        >
            <img
                src="./css/images/copy-logo.svg"
                alt="Copy"
            >
        </button>
    `;
    return container;
}
function createExternalLink({
    id,
    href = '#',
    className,
    ariaLabel,
    image,
    alt
}) {
    const link =
        document.createElement('a');
    link.id =
        id;
    link.href =
        href;
    link.target =
        '_blank';
    link.rel =
        'noopener noreferrer';
    link.className =
        `btn-link ${className}`;
    link.setAttribute(
        'aria-label',
        ariaLabel
    );
    link.innerHTML = `
        <img
            src="${image}"
            alt="${alt}"
        >
    `;
    return link;
}
function createActionLinks() {
    const container =
        document.createElement('div');
    container.className =
        'action-links';
    container.append(
        createExternalLink({
            id: 'btn-solscan',
            className: 'btn-solscan',
            ariaLabel: 'Open Solscan',
            image:
                './css/images/solscan-logo.svg',
            alt: 'Solscan'
        }),
        createExternalLink({
            id: 'btn-pump',
            className: 'btn-pump',
            ariaLabel: 'Open Pump.fun',
            image:
                './css/images/pumpfun-logo.svg',
            alt: 'Pump.fun'
        }),
        createExternalLink({
            id: 'btn-jupiter',
            className: 'btn-jup',
            ariaLabel: 'Open Jupiter',
            image:
                './css/images/jupiter-logo.svg',
            alt: 'Jupiter'
        })
    );
    return container;
}
export function createMintBar() {
    const section =
        document.createElement('div');
    section.className =
        'mint-bar';
    section.append(
        createMintAddress(),
        createActionLinks()
    );
    return section;
}
export function mountMintBar(target) {
    if (!target) {
        return null;
    }
    const section =
        createMintBar();
    target.replaceChildren(section);
    return section;
}