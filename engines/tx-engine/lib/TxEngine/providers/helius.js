'use strict';

const DEFAULT_TIMEOUT = 20_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY = 500;
const MAX_BACKOFF_DELAY = 5_000;
const FALLBACK_CONCURRENCY = 5;

const HELIUS_RPC_BASE = 'https://mainnet.helius-rpc.com';
const HELIUS_ENHANCED_TRANSACTIONS_URL = 'https://api.helius.xyz/v0/transactions';

const RETRYABLE_HTTP_STATUS_CODES = new Set([
    408,
    425,
    429,
    500,
    502,
    503,
    504
]);

class HeliusProvider {
    constructor({
        apiKeys,
        timeout = DEFAULT_TIMEOUT,
        retries = DEFAULT_RETRIES,
        retryDelay = DEFAULT_RETRY_DELAY,
        mode = 'enhanced',
        commitment = 'confirmed'
    } = {}) {
        if (!Array.isArray(apiKeys)) {
            throw new Error('Helius API keys must be provided as an array.');
        }

        this.apiKeys = [...new Set(apiKeys.map(key => String(key || '').trim()).filter(Boolean))];
        if (this.apiKeys.length === 0) {
            throw new Error('Helius API keys are required.');
        }

        this.timeout = Number(timeout) > 0 ? Number(timeout) : DEFAULT_TIMEOUT;
        this.retries = Number.isSafeInteger(Number(retries)) && Number(retries) >= 0
            ? Number(retries)
            : DEFAULT_RETRIES;
        this.retryDelay = Number.isSafeInteger(Number(retryDelay)) && Number(retryDelay) >= 0
            ? Number(retryDelay)
            : DEFAULT_RETRY_DELAY;
        this.mode = mode === 'rpc' ? 'rpc' : 'enhanced';
        this.commitment = ['processed', 'confirmed', 'finalized'].includes(String(commitment).toLowerCase())
            ? String(commitment).toLowerCase()
            : 'confirmed';
        this.index = 0;
    }

    nextKey() {
        const key = this.apiKeys[this.index];
        this.index = (this.index + 1) % this.apiKeys.length;
        return key;
    }

    async getEnhancedTransaction(signature) {
        const sig = typeof signature === 'string' ? signature : signature?.signature;
        if (!sig) return null;
        if (this.mode === 'rpc') return this.getTransaction(sig);
        const results = await this.getEnhancedTransactions([sig]);
        return results[0] ?? null;
    }

    /**
     * Fetch transactions in the same enriched Helius response format used by
     * BuyerDetector (tokenTransfers, nativeTransfers, accountData, etc.).
     * TX_FETCH_MODE=rpc is available for environments that cannot access the
     * Enhanced Transactions endpoint, but enhanced mode remains the default
     * to preserve the standalone engine's former behaviour and output shape.
     */
    async getEnhancedTransactions(signatures, retries = this.retries) {
        if (!Array.isArray(signatures) || signatures.length === 0) return [];

        const normalized = signatures
            .map(item => typeof item === 'string' ? item : item?.signature)
            .map(value => typeof value === 'string' ? value.trim() : '')
            .filter(Boolean);

        if (normalized.length === 0) return [];
        if (this.mode === 'rpc') return this.#getRpcTransactionsBatch(normalized, retries);

        const data = await this.#requestEnhancedBatch(normalized, retries);
        const bySignature = new Map();

        for (const transaction of data) {
            const signature = this.#extractSignature(transaction);
            if (signature) bySignature.set(signature, transaction);
        }

        let missing = normalized.filter(signature => !bySignature.has(signature));

        // The enhanced endpoint occasionally returns a partial result. Recover
        // only missing signatures individually; never silently advance a
        // checkpoint past an unreturned transaction.
        if (missing.length > 0) {
            const recovered = await this.#mapLimit(
                missing,
                FALLBACK_CONCURRENCY,
                async signature => {
                    const singleResponse = await this.#requestEnhancedBatch(
                        [signature],
                        Math.min(Number(retries) || 0, 1)
                    );
                    const found = singleResponse.find(
                        item => this.#extractSignature(item) === signature
                    );
                    if (!found) {
                        throw new Error(
                            `Helius Enhanced API returned no transaction for signature ${signature}.`
                        );
                    }
                    return [signature, found];
                }
            );
            for (const [signature, transaction] of recovered) {
                bySignature.set(signature, transaction);
            }
            missing = normalized.filter(signature => !bySignature.has(signature));
        }

        if (missing.length > 0) {
            throw new Error(
                `Incomplete Helius Enhanced API response; ${missing.length} transaction(s) remain missing.`
            );
        }

        // Preserve input order. TransactionScanner and cursor checkpointing
        // rely on transactions being emitted in the same order as signatures.
        return normalized.map(signature => bySignature.get(signature));
    }

    async getTransaction(signature, retries = this.retries) {
        const sig = typeof signature === 'string' ? signature : signature?.signature;
        if (!sig) throw new Error('Transaction signature is required.');

        return this.#requestRpc(
            'getTransaction',
            [sig, {
                encoding: 'jsonParsed',
                maxSupportedTransactionVersion: 1,
                commitment: this.commitment
            }],
            retries
        );
    }

    async getSignaturesForAddress(address, options = {}, retries = this.retries) {
        if (!address) throw new Error('Address is required.');
        const normalizedOptions = {
            ...options,
            commitment: options.commitment || this.commitment
        };
        return this.#requestRpc('getSignaturesForAddress', [address, normalizedOptions], retries);
    }

    async #requestEnhancedBatch(signatures, retries = this.retries) {
        let lastError = null;

        for (let attempt = 0; attempt <= retries; attempt += 1) {
            const apiKey = this.nextKey();
            try {
                const response = await this.#fetchWithTimeout(
                    `${HELIUS_ENHANCED_TRANSACTIONS_URL}?api-key=${encodeURIComponent(apiKey)}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ transactions: signatures })
                    },
                    'Enhanced Transactions'
                );

                if (RETRYABLE_HTTP_STATUS_CODES.has(response.status)) {
                    lastError = this.#httpError(response.status, 'Enhanced Transactions');
                    if (attempt < retries) {
                        this.#logRetry('Enhanced Transactions', lastError, attempt, retries);
                        await this.#backoff(attempt);
                        continue;
                    }
                    break;
                }

                if (!response.ok) {
                    throw this.#httpError(response.status, 'Enhanced Transactions');
                }

                const json = await response.json();
                if (!Array.isArray(json)) {
                    throw new Error('Invalid Helius Enhanced Transactions response: expected an array.');
                }
                return json;
            } catch (error) {
                lastError = error;
                if (this.#isRetryableError(error) && attempt < retries) {
                    this.#logRetry('Enhanced Transactions', error, attempt, retries);
                    await this.#backoff(attempt);
                    continue;
                }
                throw error;
            }
        }

        throw lastError || new Error('Helius Enhanced Transactions request failed.');
    }

    async #getRpcTransactionsBatch(signatures, retries = this.retries) {
        const payload = signatures.map((signature, index) => ({
            jsonrpc: '2.0',
            id: index + 1,
            method: 'getTransaction',
            params: [signature, {
                encoding: 'jsonParsed',
                maxSupportedTransactionVersion: 1,
                commitment: this.commitment
            }]
        }));

        let responseData;
        let lastError = null;
        for (let attempt = 0; attempt <= retries; attempt += 1) {
            const apiKey = this.nextKey();
            try {
                const response = await this.#fetchWithTimeout(
                    this.#buildRpcUrl(apiKey),
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    },
                    'RPC transaction batch'
                );

                if (RETRYABLE_HTTP_STATUS_CODES.has(response.status)) {
                    lastError = this.#httpError(response.status, 'RPC transaction batch');
                    if (attempt < retries) {
                        this.#logRetry('RPC transaction batch', lastError, attempt, retries);
                        await this.#backoff(attempt);
                        continue;
                    }
                    break;
                }
                if (!response.ok) throw this.#httpError(response.status, 'RPC transaction batch');

                responseData = await response.json();
                if (!Array.isArray(responseData)) {
                    throw new Error('Invalid JSON-RPC batch response from Helius.');
                }
                break;
            } catch (error) {
                lastError = error;
                if (this.#isRetryableError(error) && attempt < retries) {
                    this.#logRetry('RPC transaction batch', error, attempt, retries);
                    await this.#backoff(attempt);
                    continue;
                }
                throw error;
            }
        }

        if (!Array.isArray(responseData)) {
            throw lastError || new Error('Helius RPC transaction batch failed.');
        }

        const byId = new Map();
        for (const item of responseData) {
            const id = Number(item?.id);
            if (Number.isSafeInteger(id) && id >= 1 && id <= signatures.length) {
                byId.set(id, item);
            }
        }

        const output = new Array(signatures.length);
        const missingIndexes = [];
        for (let i = 0; i < signatures.length; i += 1) {
            const item = byId.get(i + 1);
            if (item && !item.error && item.result) {
                output[i] = item.result;
            } else {
                missingIndexes.push(i);
            }
        }

        if (missingIndexes.length > 0) {
            const recovered = await this.#mapLimit(
                missingIndexes,
                FALLBACK_CONCURRENCY,
                async index => {
                    const transaction = await this.getTransaction(
                        signatures[index],
                        Math.min(Number(retries) || 0, 1)
                    );
                    if (!transaction) {
                        throw new Error(`Helius RPC returned no transaction for signature ${signatures[index]}.`);
                    }
                    return [index, transaction];
                }
            );
            for (const [index, transaction] of recovered) output[index] = transaction;
        }

        if (output.some(transaction => !transaction)) {
            throw new Error('Incomplete Helius RPC batch response; refusing to discard transaction results.');
        }
        return output;
    }

    async #requestRpc(method, params, retries = this.retries) {
        let lastError = null;
        for (let attempt = 0; attempt <= retries; attempt += 1) {
            const apiKey = this.nextKey();
            try {
                const response = await this.#fetchWithTimeout(
                    this.#buildRpcUrl(apiKey),
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
                    },
                    method
                );

                if (RETRYABLE_HTTP_STATUS_CODES.has(response.status)) {
                    lastError = this.#httpError(response.status, method);
                    if (attempt < retries) {
                        this.#logRetry(method, lastError, attempt, retries);
                        await this.#backoff(attempt);
                        continue;
                    }
                    break;
                }
                if (!response.ok) throw this.#httpError(response.status, method);

                const json = await response.json();
                if (json?.error) {
                    const rpcError = new Error(json.error.message || JSON.stringify(json.error));
                    rpcError.rpcCode = json.error.code;
                    if (this.#isRetryableRpcError(json.error) && attempt < retries) {
                        lastError = rpcError;
                        this.#logRetry(method, rpcError, attempt, retries);
                        await this.#backoff(attempt);
                        continue;
                    }
                    throw rpcError;
                }
                return json?.result;
            } catch (error) {
                lastError = error;
                if (this.#isRetryableError(error) && attempt < retries) {
                    this.#logRetry(method, error, attempt, retries);
                    await this.#backoff(attempt);
                    continue;
                }
                throw error;
            }
        }
        throw lastError || new Error(`Helius ${method} request failed.`);
    }

    #extractSignature(transaction) {
        const signature = transaction?.signature ??
            transaction?.transaction?.signatures?.[0] ??
            transaction?.signatures?.[0];
        return typeof signature === 'string' && signature.trim() !== ''
            ? signature.trim()
            : null;
    }

    #buildRpcUrl(apiKey) {
        return `${HELIUS_RPC_BASE}/?api-key=${encodeURIComponent(apiKey)}`;
    }

    #httpError(status, operation) {
        const error = new Error(`${operation} HTTP ${status}`);
        error.statusCode = status;
        return error;
    }

    async #fetchWithTimeout(url, options = {}, operation = 'Helius request') {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeout);
        try {
            return await fetch(url, { ...options, signal: controller.signal });
        } catch (error) {
            if (error?.name === 'AbortError') {
                const timeoutError = new Error(`${operation} timed out after ${this.timeout}ms`);
                timeoutError.code = 'ETIMEDOUT';
                throw timeoutError;
            }
            throw error;
        } finally {
            clearTimeout(timer);
        }
    }

    async #mapLimit(items, concurrency, mapper) {
        const results = new Array(items.length);
        const errors = new Array(items.length);
        let nextIndex = 0;
        const workerCount = Math.min(concurrency, items.length);
        await Promise.all(Array.from({ length: workerCount }, async () => {
            while (true) {
                const index = nextIndex++;
                if (index >= items.length) return;
                try {
                    results[index] = await mapper(items[index]);
                } catch (error) {
                    errors[index] = error;
                }
            }
        }));
        const firstFailure = errors.find(Boolean);
        if (firstFailure) {
            firstFailure.batchErrors = errors.filter(Boolean);
            throw firstFailure;
        }
        return results;
    }

    #isRetryableError(error) {
        const statusCode = Number(error?.statusCode);
        if (RETRYABLE_HTTP_STATUS_CODES.has(statusCode)) return true;
        const message = String(error?.message || error).toLowerCase();
        return message.includes('timed out') ||
            message.includes('timeout') ||
            message.includes('fetch failed') ||
            message.includes('econnreset') ||
            message.includes('econnrefused') ||
            message.includes('etimedout') ||
            message.includes('eai_again') ||
            message.includes('socket') ||
            message.includes('network');
    }

    #isRetryableRpcError(error) {
        const code = Number(error?.code ?? error?.rpcCode);
        const message = String(error?.message || '').toLowerCase();
        return code === -32005 || code === -32004 || code === -32002 ||
            message.includes('timeout') || message.includes('timed out') ||
            message.includes('rate limit') || message.includes('temporarily') ||
            message.includes('internal error') || message.includes('too many requests');
    }

    #logRetry(operation, error, attempt, retries) {
        console.warn(
            `[Helius] ${operation} failed: ${error?.message || error}. ` +
            `Retry ${attempt + 1}/${retries} using next API key.`
        );
    }

    async #backoff(attempt) {
        const exponential = this.retryDelay * (2 ** attempt);
        const jitter = Math.floor(Math.random() * 150);
        const delay = Math.min(exponential + jitter, MAX_BACKOFF_DELAY);
        await new Promise(resolve => setTimeout(resolve, delay));
    }
}

module.exports = HeliusProvider;
