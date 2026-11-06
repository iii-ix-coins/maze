'use strict';

class JupiterApiError extends Error {
    constructor(message, {
        status = null,
        code = 'JUPITER_API_ERROR',
        retryAfterMs = null,
        details = null
    } = {}) {
        super(message);
        this.name = 'JupiterApiError';
        this.status = status;
        this.code = code;
        this.retryAfterMs = retryAfterMs;
        this.details = details;
    }
}

class JupiterApiClient {
    constructor({
        apiKey,
        baseUrl = 'https://api.jup.ag',
        timeoutMs = 10000,
        maxRetries = 1,
        retryBaseMs = 1000,
        requestGapMs = 1200
    } = {}) {
        this.apiKey = String(apiKey ?? '').trim();
        this.baseUrl = String(baseUrl).replace(/\/$/, '');
        this.timeoutMs = this._positiveInteger(timeoutMs, 10000);
        this.maxRetries = this._nonNegativeInteger(maxRetries, 1);
        this.retryBaseMs = this._positiveInteger(retryBaseMs, 1000);
        this.requestGapMs = this._nonNegativeInteger(requestGapMs, 1200);
        this.lastRequestStartedAt = 0;
    }

    _positiveInteger(value, fallback) {
        const n = Number(value);
        return Number.isInteger(n) && n > 0 ? n : fallback;
    }

    _nonNegativeInteger(value, fallback) {
        const n = Number(value);
        return Number.isInteger(n) && n >= 0 ? n : fallback;
    }

    _buildUrl(pathname, params = {}) {
        const url = new URL(`${this.baseUrl}${pathname}`);

        for (const [key, value] of Object.entries(params)) {
            if (value === undefined || value === null || value === '') {
                continue;
            }
            url.searchParams.set(key, String(value));
        }

        return url;
    }

    async _waitForRequestGap() {
        const elapsed = Date.now() - this.lastRequestStartedAt;
        const waitMs = Math.max(this.requestGapMs - elapsed, 0);

        if (waitMs > 0) {
            await new Promise(resolve => setTimeout(resolve, waitMs));
        }
    }

    async _request(pathname, params = {}) {
        let attempt = 0;

        while (true) {
            await this._waitForRequestGap();
            this.lastRequestStartedAt = Date.now();

            const controller = new AbortController();
            const timeout = setTimeout(
                () => controller.abort(),
                this.timeoutMs
            );

            try {
                const url = this._buildUrl(pathname, params);
                const headers = {
                    Accept: 'application/json'
                };

                if (this.apiKey) {
                    headers['x-api-key'] = this.apiKey;
                }

                const response = await fetch(url, {
                    method: 'GET',
                    headers,
                    signal: controller.signal
                });

                const rawText = await response.text();
                let body = null;

                if (rawText) {
                    try {
                        body = JSON.parse(rawText);
                    } catch {
                        body = rawText;
                    }
                }

                if (response.ok) {
                    return body;
                }

                const retryAfterHeader =
                    response.headers.get('retry-after');

                const retryAfterSeconds = Number(
                    retryAfterHeader
                );

                const retryAfterMs = Number.isFinite(
                    retryAfterSeconds
                ) && retryAfterSeconds >= 0
                    ? Math.ceil(retryAfterSeconds * 1000)
                    : null;

                const retryable =
                    response.status === 429 ||
                    response.status >= 500;

                if (
                    retryable &&
                    attempt < this.maxRetries
                ) {
                    const backoffMs = retryAfterMs ?? (
                        this.retryBaseMs *
                        Math.pow(2, attempt)
                    );

                    attempt += 1;

                    await new Promise(resolve =>
                        setTimeout(resolve, backoffMs)
                    );

                    continue;
                }

                throw new JupiterApiError(
                    `Jupiter API request failed: HTTP ${response.status}`,
                    {
                        status: response.status,
                        code:
                            response.status === 429
                                ? 'RATE_LIMITED'
                                : 'HTTP_ERROR',
                        retryAfterMs,
                        details: body
                    }
                );
            } catch (error) {
                if (error?.name === 'AbortError') {
                    if (attempt < this.maxRetries) {
                        attempt += 1;
                        await new Promise(resolve =>
                            setTimeout(
                                resolve,
                                this.retryBaseMs * Math.pow(2, attempt - 1)
                            )
                        );
                        continue;
                    }

                    throw new JupiterApiError(
                        `Jupiter API request timed out after ${this.timeoutMs}ms.`,
                        {
                            code: 'TIMEOUT'
                        }
                    );
                }

                if (error instanceof JupiterApiError) {
                    throw error;
                }

                if (attempt < this.maxRetries) {
                    attempt += 1;
                    await new Promise(resolve =>
                        setTimeout(
                            resolve,
                            this.retryBaseMs * Math.pow(2, attempt - 1)
                        )
                    );
                    continue;
                }

                throw new JupiterApiError(
                    error?.message || 'Unknown Jupiter API error.',
                    {
                        code: 'NETWORK_ERROR',
                        details: error
                    }
                );
            } finally {
                clearTimeout(timeout);
            }
        }
    }

    async getPrices(mintAddresses) {
        if (!Array.isArray(mintAddresses)) {
            throw new TypeError('mintAddresses must be an array.');
        }

        const mints = Array.from(
            new Set(
                mintAddresses
                    .map(value => String(value ?? '').trim())
                    .filter(Boolean)
            )
        );

        if (mints.length === 0) {
            return {};
        }

        if (mints.length > 50) {
            throw new RangeError(
                'Jupiter Price V3 accepts at most 50 mint ids per request.'
            );
        }

        return this._request('/price/v3', {
            ids: mints.join(',')
        });
    }

    async getTokenInformation(mintAddresses) {
        if (!Array.isArray(mintAddresses)) {
            throw new TypeError('mintAddresses must be an array.');
        }

        const mints = Array.from(
            new Set(
                mintAddresses
                    .map(value => String(value ?? '').trim())
                    .filter(Boolean)
            )
        );

        if (mints.length === 0) {
            return [];
        }

        if (mints.length > 100) {
            throw new RangeError(
                'Jupiter Tokens V2 search accepts at most 100 known mint addresses per request.'
            );
        }

        return this._request('/tokens/v2/search', {
            query: mints.join(',')
        });
    }

    async getTag(query) {
        const value = String(query ?? '').trim();
        if (!value) {
            throw new TypeError('Tag query is required.');
        }
        return this._request('/tokens/v2/tag', { query: value });
    }

    async getCategory(
        category,
        interval,
        limit
    ) {
        const safeCategory = String(category ?? '').trim();
        const safeInterval = String(interval ?? '').trim();

        const allowedCategories = new Set([
            'toporganicscore',
            'toptraded',
            'toptrending'
        ]);

        const allowedIntervals = new Set([
            '5m',
            '1h',
            '6h',
            '24h'
        ]);

        if (!allowedCategories.has(safeCategory)) {
            throw new TypeError(
                `Unsupported Jupiter token category: ${safeCategory}`
            );
        }

        if (!allowedIntervals.has(safeInterval)) {
            throw new TypeError(
                `Unsupported Jupiter token interval: ${safeInterval}`
            );
        }

        const params = {};
        if (limit !== undefined) {
            params.limit = limit;
        }

        return this._request(
            `/tokens/v2/${safeCategory}/${safeInterval}`,
            params
        );
    }

    async getRecent(limit) {
        const params = {};
        if (limit !== undefined) {
            params.limit = limit;
        }
        return this._request('/tokens/v2/recent', params);
    }
}

module.exports = {
    JupiterApiClient,
    JupiterApiError
};
