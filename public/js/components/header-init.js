'use strict';

import {
    mountHeader
} from './Header.js';

const target =
    document.getElementById(
        'site-header'
    );

if (target) {
    mountHeader(target);
}