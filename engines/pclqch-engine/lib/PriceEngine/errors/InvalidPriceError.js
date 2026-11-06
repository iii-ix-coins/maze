'use strict';
const {
  ERROR_CODES
} = require('../constants');
class InvalidPriceError extends Error {
  constructor(message = 'Invalid price received.') {
    super(message);
    this.name = 'InvalidPriceError';
    this.code = ERROR_CODES.INVALID_PRICE;
    Error.captureStackTrace?.(
      this,
      InvalidPriceError
    );
  }
}
module.exports = InvalidPriceError;