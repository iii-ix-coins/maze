'use strict';
const {
  ERROR_CODES
} = require('../constants');
class ProviderTimeoutError extends Error {
  constructor(message = 'Provider request timed out.') {
    super(message);
    this.name = 'ProviderTimeoutError';
    this.code = ERROR_CODES.PROVIDER_TIMEOUT;
    Error.captureStackTrace?.(
      this,
      ProviderTimeoutError
    );
  }
}
module.exports = ProviderTimeoutError;