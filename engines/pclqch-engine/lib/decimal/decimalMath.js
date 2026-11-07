'use strict';
const Decimal = require('./decimalFactory');
const {
    toDecimal
} = require('./decimalUtils');
function add(a, b) {
    return toDecimal(a).plus(
        toDecimal(b)
    );
}
function subtract(a, b) {
    return toDecimal(a).minus(
        toDecimal(b)
    );
}
function multiply(a, b) {
    return toDecimal(a).times(
        toDecimal(b)
    );
}
function divide(a, b) {
    const divisor =
        toDecimal(b);
    if (divisor.isZero()) {
        throw new RangeError(
            'Division by zero.'
        );
    }
    return toDecimal(a).div(
        divisor
    );
}
function percentage(value, percent) {
    return multiply(
        value,
        divide(percent, 100)
    );
}
function min(a, b) {
    return Decimal.min(
        toDecimal(a),
        toDecimal(b)
    );
}
function max(a, b) {
    return Decimal.max(
        toDecimal(a),
        toDecimal(b)
    );
}
function abs(value) {
    return toDecimal(value).abs();
}
function compare(a, b) {
    return toDecimal(a).cmp(
        toDecimal(b)
    );
}
function isZero(value) {
    return toDecimal(value).isZero();
}
function isPositive(value) {
    return toDecimal(value).isPositive();
}
function isNegative(value) {
    return toDecimal(value).isNegative();
}
module.exports = {
    add,
    subtract,
    multiply,
    divide,
    percentage,
    min,
    max,
    abs,
    compare,
    isZero,
    isPositive,
    isNegative
};