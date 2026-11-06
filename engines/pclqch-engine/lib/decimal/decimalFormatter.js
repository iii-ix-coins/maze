'use strict';
const {
    toDecimal
} = require('./decimalUtils');
function toString(value) {
    return toDecimal(value).toString();
}
function toFixed(value, decimals) {
    return toDecimal(value).toFixed(decimals);
}
function trimZeros(value) {
    const decimal = toDecimal(value);
    const text = decimal.toFixed(decimal.decimalPlaces());
    return text
        .replace(/(\.\d*?[1-9])0+$/u, '$1')
        .replace(/\.0$/u, '')
        .replace(/\.$/u, '');
}
function format(value) {
    const decimal = toDecimal(value);

    return decimal.toFixed(
        decimal.decimalPlaces()
    );
}
module.exports = {
    format,
    toString,
    toFixed,
    trimZeros
};