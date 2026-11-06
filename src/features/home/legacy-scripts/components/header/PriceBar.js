'use strict';
function createMetricBox({
    label,
    valueId,
    className
}) {
    const box =
        document.createElement('div');
    box.className =
        'bar-box';
    box.innerHTML = `
        <span>${label}</span>
        <div
            id="${valueId}"
            class="metric-value ${className}"
        >
            $
        </div>
    `;
    return box;
}
export function createPriceBar() {
    const section =
        document.createElement('div');
    section.className =
        'price-bar';
    section.append(
        createMetricBox({
            label: 'Price',
            valueId: 'price-val',
            className: 'price'
        }),
        createMetricBox({
            label: 'Liquidity',
            valueId: 'liquidity-val',
            className: 'liquidity'
        }),
        createMetricBox({
            label: '24h Vol',
            valueId: 'volume-24h-val',
            className: 'volume-24h'
        }),
        createMetricBox({
            label: 'MC',
            valueId: 'market-cap-val',
            className: 'market-cap'
        })
    );
    return section;
}
export function mountPriceBar(target) {
    if (!target) {
        return null;
    }
    const section =
        createPriceBar();
    target.replaceChildren(section);
    return section;
}