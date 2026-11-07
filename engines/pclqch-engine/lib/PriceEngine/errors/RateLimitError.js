'use strict';
const {
    ERROR_CODES
} = require('../constants');
class RateLimitError extends Error {
    constructor(
        message = 'Provider rate limit exceeded.'
    ) {
        super(message);
        this.name = 'RateLimitError';
        this.code = ERROR_CODES.RATE_LIMIT;
        this.statusCode = 429;
        Error.captureStackTrace?.(
            this,
            RateLimitError
        );
    }
}
module.exports = RateLimitError;