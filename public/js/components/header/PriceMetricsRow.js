'use strict';

import {
    createPriceBar
} from './PriceBar.js';

import {
    createPriceChangesGrid
} from './PriceChangesGrid.js';

export function createPriceMetricsRow() {
    const row =
        document.createElement('div');

    row.className =
        'price-metrics-row';

    row.append(
        createPriceBar(),
        createPriceChangesGrid()
    );

    return row;
}

export function mountPriceMetricsRow(target) {
    if (!target) {
        return null;
    }

    const row =
        createPriceMetricsRow();

    target.replaceChildren(row);

    return row;
}