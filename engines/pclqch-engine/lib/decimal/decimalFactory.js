'use strict';
const Decimal = require('decimal.js');
Decimal.set({
    precision: 40,
    rounding: Decimal.ROUND_HALF_UP,
    toExpNeg: -100,
    toExpPos: 100,
    minE: -1000,
    maxE: 1000
});
module.exports = Decimal;