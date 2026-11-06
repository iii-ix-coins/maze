'use strict';
const {
    ERROR_CODES
} = require('../constants');
class ProviderUnavailableError extends Error {
    constructor(message = 'Provider is unavailable.') {
        super(message);
        this.name = 'ProviderUnavailableError';
        this.code = ERROR_CODES.PROVIDER_UNAVAILABLE;
        Error.captureStackTrace?.(
            this,
            ProviderUnavailableError
        );
    }
}
module.exports = ProviderUnavailableError;