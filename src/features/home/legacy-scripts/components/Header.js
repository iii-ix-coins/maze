'use strict';

import {
    createNavigation
} from './header/Navigation.js';

export function createHeader() {
    const header =
        document.createElement('header');

    header.className = 'header';

    header.append(
        createNavigation()
    );

    return header;
}

export function mountHeader(
    target,
    options = {}
) {
    if (!target) {
        return null;
    }

    const header =
        createHeader(options);

    target.replaceChildren(header);

    return header;
}