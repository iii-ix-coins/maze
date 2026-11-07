'use strict';
const CHANGE_PERIODS = [
    {
        label: '1m',
        id: 'change-1m'
    },
    {
        label: '5m',
        id: 'change-5m'
    },
    {
        label: '24h',
        id: 'change-24h'
    }
];
function createChangeBox({
    label,
    id
}) {
    const box =
        document.createElement('div');
    box.className =
        'change-box';
    box.innerHTML = `
        <div class="change-period">
            ${label}
        </div>
        <div id="${id}">
            --
        </div>
    `;
    return box;
}
export function createPriceChangesGrid() {
    const section =
        document.createElement('div');
    section.className =
        'price-changes-grid';
    for (
        const period
        of CHANGE_PERIODS
    ) {
        section.append(
            createChangeBox(period)
        );
    }
    return section;
}
export function mountPriceChangesGrid(
    target
) {
    if (!target) {
        return null;
    }
    const section =
        createPriceChangesGrid();
    target.replaceChildren(section);
    return section;
}