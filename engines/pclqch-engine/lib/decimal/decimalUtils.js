'use strict';
const Decimal = require('./decimalFactory');
function toDecimal(value) {
    if (value instanceof Decimal) {
        return value;
    }
    if (
        value === null ||
        value === undefined ||
        value === ''
    ) {
        return new Decimal(0);
    }
    return new Decimal(value);
}
function isDecimal(value) {
    return value instanceof Decimal;
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
function isInteger(value) {
    return toDecimal(value).isInteger();
}
function equals(a, b) {
    return toDecimal(a).equals(
        toDecimal(b)
    );
}
function greaterThan(a, b) {
    return toDecimal(a).greaterThan(
        toDecimal(b)
    );
}
function greaterThanOrEqual(a, b) {
    return toDecimal(a).greaterThanOrEqualTo(
        toDecimal(b)
    );
}
function lessThan(a, b) {
    return toDecimal(a).lessThan(
        toDecimal(b)
    );
}
function lessThanOrEqual(a, b) {
    return toDecimal(a).lessThanOrEqualTo(
        toDecimal(b)
    );
}
function compare(a, b) {
    return toDecimal(a).comparedTo(
        toDecimal(b)
    );
}
module.exports = {
    toDecimal,
    isDecimal,
    isZero,
    isPositive,
    isNegative,
    isInteger,
    equals,
    greaterThan,
    greaterThanOrEqual,
    lessThan,
    lessThanOrEqual,
    compare
};