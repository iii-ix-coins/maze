'use strict';

const { PublicKey } = require('@solana/web3.js');
const {
    sleep,
    throwIfAborted
} = require('./utils');
const { resolveTokenProgramId } = require('./rpc');

function getRpcUrls(runtimeConfig) {
    const urls = Array.isArray(runtimeConfig?.rpcUrls)
        ? runtimeConfig.rpcUrls.filter(Boolean)
        : [];

    if (urls.length > 0) {
        return [...new Set(urls)];
    }

    if (runtimeConfig?.rpcUrl) {
        return [runtimeConfig.rpcUrl];
    }

    throw new Error('No RPC URLs configured.');
}

function isHeliusRpcUrl(rpcUrl) {
    try {
        const url = new URL(rpcUrl);
        const host = url.hostname.toLowerCase();

        return (
            host.includes('helius-rpc.com') ||
            host.includes('helius.dev')
        );
    } catch {
        return String(rpcUrl || '').toLowerCase().includes('helius');
    }
}

function getHeliusRpcUrls(runtimeConfig) {
    return getRpcUrls(runtimeConfig).filter(isHeliusRpcUrl);
}

function getPositiveInteger(value, fallback, min = 1) {
    const n = Number(value);
    return Number.isInteger(n) && n >= min ? n : fallback;
}

function isRetryableRpcError(error) {
    if (
        error?.name === 'AbortError' ||
        error?.code === 'ABORT_ERR'
    ) {
        return false;
    }

    const status = Number(
        error?.status ??
        error?.httpStatus
    );

    const message = String(
        error?.message || error || ''
    ).toLowerCase();

    if (
        Number.isInteger(status) &&
        [
            408,
            425,
            429,
            500,
            502,
            503,
            504,
            520,
            521,
            522,
            523,
            524
        ].includes(status)
    ) {
        return true;
    }

    return (
        message.includes('429') ||
        message.includes('rate limit') ||
        message.includes('too many requests') ||
        message.includes('502') ||
        message.includes('503') ||
        message.includes('504') ||
        message.includes('413') ||
        message.includes('payload too large') ||
        message.includes('timeout') ||
        message.includes('aborted') ||
        message.includes('fetch failed') ||
        message.includes('socket hang up') ||
        message.includes('econnreset') ||
        message.includes('etimedout') ||
        message.includes('enotfound') ||
        message.includes("expected ',' or ']'") ||
        message.includes('unexpected end of json') ||
        message.includes('unexpected end of input')
    );
}

function calculateBackoff(attempt, baseDelayMs = 500, maxDelayMs = 8000) {
    const exponential = Math.min(
        baseDelayMs * (2 ** Math.max(0, attempt - 1)),
        maxDelayMs
    );

    const jitter = Math.floor(Math.random() * 250);

    return exponential + jitter;
}

async function rpcPostJson(
    rpcUrl,
    method,
    params,
    options = {}
) {
    const {
        attempts = 2,
        timeoutMs = 60_000,
        label = method,
        requestId = 1,
        signal = null
    } = options;

    let lastError = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        throwIfAborted(signal);

        const controller = new AbortController();

        const onExternalAbort = () => {
            try {
                controller.abort(signal?.reason);
            } catch {
                controller.abort();
            }
        };

        if (signal) {
            signal.addEventListener(
                'abort',
                onExternalAbort,
                { once: true }
            );
        }

        const timeout = setTimeout(() => {
            controller.abort();
        }, timeoutMs);

        try {
            const response = await fetch(rpcUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: requestId,
                    method,
                    params
                }),
                signal: controller.signal
            });

            const text = await response.text();

            if (!response.ok) {
                const suffix = text
                    ? ` - ${text.slice(0, 500)}`
                    : '';

                const httpError = new Error(
                    `${label} HTTP ${response.status} ${response.statusText || ''}${suffix}`.trim()
                );

                httpError.status = response.status;
                httpError.httpStatus = response.status;

                throw httpError;
            }

            let payload;

            try {
                payload = JSON.parse(text);
            } catch (error) {
                const parseError = new Error(
                    `${label} JSON parse failed: ${error.message}`
                );
                parseError.cause = error;
                throw parseError;
            }

            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                throw new Error(`${label} returned an invalid JSON-RPC payload.`);
            }

            if (payload?.error) {
                const message =
                    payload.error?.message ||
                    JSON.stringify(payload.error);

                const code = payload.error?.code;

                const rpcError = new Error(
                    `${label} RPC error${code !== undefined ? ` [${code}]` : ''}: ${message}`
                );
                rpcError.rpcCode = code;
                throw rpcError;
            }

            if (!Object.prototype.hasOwnProperty.call(payload, 'result')) {
                throw new Error(`${label} returned neither a JSON-RPC result nor an error.`);
            }

            return payload;
        } catch (error) {
            if (signal?.aborted) {
                throw (
                    signal.reason ||
                    Object.assign(
                        new Error(`${label} aborted.`),
                        {
                            name: 'AbortError',
                            code: 'ABORT_ERR'
                        }
                    )
                );
            }

            if (
                controller.signal.aborted &&
                !signal?.aborted
            ) {
                const timeoutError = new Error(
                    `${label} timed out after ${timeoutMs}ms.`
                );

                timeoutError.name = 'TimeoutError';
                timeoutError.code = 'ETIMEDOUT';
                timeoutError.cause = error;
                error = timeoutError;
            }

            lastError = error;

            if (attempt >= attempts) {
                break;
            }

            if (!isRetryableRpcError(error)) {
                break;
            }

            await sleep(
                calculateBackoff(attempt),
                signal
            );
        } finally {
            clearTimeout(timeout);

            if (signal) {
                signal.removeEventListener(
                    'abort',
                    onExternalAbort
                );
            }
        }
    }

    throw lastError;
}

async function withRpcFailover(
    rpcUrls,
    fn,
    options = {}
) {
    const {
        label = 'request',
        startIndex = 0,
        cooldownMs = 1500,
        signal = null
    } = options;

    if (!Array.isArray(rpcUrls) || rpcUrls.length === 0) {
        throw new Error(`No RPC URLs configured for ${label}.`);
    }

    let lastError = null;
    const total = rpcUrls.length;
    const normalizedStartIndex =
        ((Number(startIndex) || 0) % total + total) % total;

    for (let offset = 0; offset < total; offset += 1) {
        throwIfAborted(signal);

        const index = (normalizedStartIndex + offset) % total;
        const rpcUrl = rpcUrls[index];

        try {
            return await fn(rpcUrl, index);
        } catch (error) {
            lastError = error;

            if (!isRetryableRpcError(error)) {
                throw error;
            }

            console.warn(
                `[rpcEngine] ${label} failed on rpc#${index + 1}/${total}:`,
                error?.message || error
            );

            if (offset < total - 1) {
                await sleep(cooldownMs, signal);
            }
        }
    }

    throw lastError;
}

function normalizePubkey(value) {
    if (!value) {
        return '';
    }

    if (typeof value === 'string') {
        return value;
    }

    if (typeof value.toBase58 === 'function') {
        return value.toBase58();
    }

    if (typeof value.toString === 'function') {
        return value.toString();
    }

    return '';
}

function bufferFromRpcData(data) {
    if (!data) {
        throw new Error('Empty account data.');
    }

    if (Buffer.isBuffer(data)) {
        return data;
    }

    if (Array.isArray(data) && typeof data[0] === 'string') {
        const [encoded, encoding] = data;
        return Buffer.from(
            encoded,
            encoding || 'base64'
        );
    }

    if (typeof data === 'string') {
        return Buffer.from(data, 'base64');
    }

    if (data?.data) {
        return bufferFromRpcData(data.data);
    }

    throw new Error('Unsupported account data format.');
}

function decodeTokenAccountSlice(rawData) {
    const buffer = bufferFromRpcData(rawData);

    if (buffer.length < 40) {
        throw new Error(
            `Token account slice too short: ${buffer.length} bytes`
        );
    }

    const owner = new PublicKey(
        buffer.subarray(0, 32)
    ).toBase58();

    const amount = buffer
        .readBigUInt64LE(32)
        .toString();

    return {
        owner,
        amount
    };
}

function normalizeTokenAccount(account, decimals = 0) {
    if (!account) {
        return null;
    }

    const address = normalizePubkey(
        account.address ||
        account.pubkey
    );

    const owner = normalizePubkey(
        account.owner
    );

    let rawAmount = '';

    if (
        account.amount !== undefined &&
        account.amount !== null
    ) {
        if (typeof account.amount === 'number') {
            if (
                !Number.isSafeInteger(account.amount) ||
                account.amount < 0
            ) {
                return null;
            }
        }

        rawAmount = String(account.amount);
    }

    if (!address || !owner || !/^\d+$/.test(rawAmount)) {
        return null;
    }

    return {
        address,
        owner,
        amount: rawAmount,
        decimals
    };
}

function extractProgramAccountsPage(result) {
    if (Array.isArray(result)) {
        return {
            accounts: result,
            paginationKey: null,
            totalResults: null,
            contextSlot: null
        };
    }

    if (result?.accounts && Array.isArray(result.accounts)) {
        return {
            accounts: result.accounts,
            paginationKey: result.paginationKey ?? null,
            totalResults: result.totalResults ?? null,
            contextSlot:
                Number.isInteger(result?.context?.slot)
                    ? result.context.slot
                    : null
        };
    }

    if (result?.value && Array.isArray(result.value)) {
        return {
            accounts: result.value,
            paginationKey: result.paginationKey ?? null,
            totalResults: result.totalResults ?? null,
            contextSlot:
                Number.isInteger(result?.context?.slot)
                    ? result.context.slot
                    : null
        };
    }

    if (
        result?.value?.accounts &&
        Array.isArray(result.value.accounts)
    ) {
        return {
            accounts: result.value.accounts,
            paginationKey:
                result.value.paginationKey ??
                result.paginationKey ??
                null,
            totalResults:
                result.value.totalResults ??
                result.totalResults ??
                null,
            contextSlot:
                Number.isInteger(result?.context?.slot)
                    ? result.context.slot
                    : Number.isInteger(result?.value?.context?.slot)
                        ? result.value.context.slot
                        : null
        };
    }

    return {
        accounts: [],
        paginationKey: null,
        totalResults: null,
        contextSlot: null
    };
}

async function fetchMintInfoSmart(
    runtimeConfig,
    options = {}
) {
    const signal = options.signal || null;
    const rpcUrls = getRpcUrls(runtimeConfig);
    const mint = new PublicKey(
        runtimeConfig.mintAddress
    ).toBase58();

    return withRpcFailover(
        rpcUrls,
        (rpcUrl, index) => rpcPostJson(
            rpcUrl,
            'getAccountInfo',
            [
                mint,
                {
                    commitment: runtimeConfig.commitment,
                    encoding: 'jsonParsed'
                }
            ],
            {
                label: 'getAccountInfo',
                attempts:
                    runtimeConfig.rpcRequestAttempts || 2,
                timeoutMs:
                    runtimeConfig.rpcMintTimeoutMs || 20_000,
                requestId: `mint-${index}`,
                signal
            }
        ),
        {
            label: 'getAccountInfo',
            signal
        }
    ).then(payload => {
        if (!payload?.result) {
            return null;
        }

        return payload.result;
    });
}

async function* fetchHeliusProgramAccountsV2Pages(
    runtimeConfig,
    mintInfo,
    options = {}
) {
    const signal = options.signal || null;
    const rpcUrls = getHeliusRpcUrls(runtimeConfig);

    if (rpcUrls.length === 0) {
        throw new Error(
            'No Helius RPC URL is configured for getProgramAccountsV2.'
        );
    }

    const tokenProgramId = resolveTokenProgramId(
        mintInfo,
        runtimeConfig
    );

    const mint = new PublicKey(
        runtimeConfig.mintAddress
    ).toBase58();

    const limit = Math.min(
        10000,
        getPositiveInteger(
            runtimeConfig.programAccountsV2PageSize,
            5000
        )
    );

    let paginationKey = null;
    let page = 0;
    let totalAccounts = 0;
    let slot = null;
    let currentRpcIndex = 0;

    console.info(
        '[rpcEngine] Using Helius getProgramAccountsV2 cursor pagination...'
    );

    while (page < (runtimeConfig.tokenScanMaxPages || 100000)) {
        throwIfAborted(signal);

        const paramsConfig = {
            commitment: runtimeConfig.commitment,
            encoding: 'base64',
            withContext: true,
            limit,
            filters: [
                {
                    memcmp: {
                        offset: 0,
                        bytes: mint
                    }
                }
            ],
            dataSlice: {
                offset: 32,
                length: 40
            }
        };

        if (paginationKey) {
            paramsConfig.paginationKey = paginationKey;
        }

        const payload = await withRpcFailover(
            rpcUrls,
            (rpcUrl, rpcIndex) => {
                currentRpcIndex = rpcIndex;
                return rpcPostJson(
                rpcUrl,
                'getProgramAccountsV2',
                [
                    tokenProgramId,
                    paramsConfig
                ],
                {
                    label:
                        `getProgramAccountsV2 page ${page + 1}`,
                    attempts:
                        runtimeConfig.tokenScanRequestAttempts || 2,
                    timeoutMs:
                        runtimeConfig.tokenScanRequestTimeoutMs || 60_000,
                    requestId:
                        `gpa-v2-${page + 1}-${rpcIndex}`,
                    signal
                }
                );
            },
            {
                label:
                    `getProgramAccountsV2 page ${page + 1}`,
                startIndex: currentRpcIndex,
                signal
            }
        );

        const extracted =
            extractProgramAccountsPage(payload?.result);

        page += 1;

        if (extracted.contextSlot !== null) {
            slot = extracted.contextSlot;
        }

        const normalized = [];

        for (const account of extracted.accounts) {
            const address = normalizePubkey(
                account?.pubkey || account?.address
            );

            if (!address || !account?.account?.data) {
                continue;
            }

            try {
                const decoded = decodeTokenAccountSlice(
                    account.account.data
                );

                normalized.push({
                    address,
                    owner: decoded.owner,
                    amount: decoded.amount,
                    decimals: Number(
                        mintInfo?.value?.data?.parsed?.info?.decimals || 0
                    )
                });
            } catch {
                // Skip malformed account payloads.
            }
        }

        totalAccounts += extracted.accounts.length;

        yield {
            page,
            strategy: 'helius-getProgramAccountsV2',
            tokenProgramId,
            tokenAccounts: normalized,
            discoveredAccounts: extracted.accounts.length,
            totalDiscoveredAccounts: totalAccounts,
            totalResults: extracted.totalResults,
            slot,
            skippedAccounts:
                extracted.accounts.length - normalized.length
        };

        const nextPaginationKey =
            extracted.paginationKey;

        if (!nextPaginationKey) {
            break;
        }

        if (nextPaginationKey === paginationKey) {
            throw new Error(
                'Helius getProgramAccountsV2 returned the same pagination key twice.'
            );
        }

        paginationKey = nextPaginationKey;
    }

    if (page >= (runtimeConfig.tokenScanMaxPages || 100000)) {
        throw new Error(
            'Maximum token scan page limit reached. Snapshot aborted for safety.'
        );
    }
}

async function* fetchHeliusTokenAccountsPages(
    runtimeConfig,
    options = {}
) {
    const signal = options.signal || null;
    const rpcUrls = getHeliusRpcUrls(runtimeConfig);

    if (rpcUrls.length === 0) {
        throw new Error(
            'No Helius RPC URL is configured for getTokenAccounts.'
        );
    }

    const mint = new PublicKey(
        runtimeConfig.mintAddress
    ).toBase58();

    const limit = Math.min(
        1000,
        getPositiveInteger(
            runtimeConfig.tokenScanPageSize,
            1000
        )
    );

    let page = 1;
    let cursor = null;
    let totalDiscovered = 0;
    let currentRpcIndex = 0;

    console.info(
        '[rpcEngine] Using Helius getTokenAccounts pagination...'
    );

    while (page <= (runtimeConfig.tokenScanMaxPages || 100000)) {
        throwIfAborted(signal);

        const params = {
            mint,
            page,
            limit,
            options: {
                showZeroBalance: false
            }
        };

        if (cursor) {
            params.cursor = cursor;
        }

        const payload = await withRpcFailover(
            rpcUrls,
            (rpcUrl, rpcIndex) => {
                currentRpcIndex = rpcIndex;
                return rpcPostJson(
                rpcUrl,
                'getTokenAccounts',
                params,
                {
                    label:
                        `getTokenAccounts page ${page}`,
                    attempts:
                        runtimeConfig.tokenScanRequestAttempts || 2,
                    timeoutMs:
                        runtimeConfig.tokenScanRequestTimeoutMs || 60_000,
                    requestId:
                        `token-${page}-${rpcIndex}`,
                    signal
                }
                );
            },
            {
                label:
                    `getTokenAccounts page ${page}`,
                // Keep the last successful endpoint for cursor pagination.
                // Failover is used only when the current request fails.
                startIndex: currentRpcIndex,
                signal
            }
        );

        const result = payload?.result || {};
        const accounts = Array.isArray(
            result.token_accounts
        )
            ? result.token_accounts
            : [];

        const normalized = [];
        let unsafeNumericAmount = false;

        for (const account of accounts) {
            if (
                typeof account?.amount === 'number' &&
                !Number.isSafeInteger(account.amount)
            ) {
                unsafeNumericAmount = true;
                break;
            }

            const normalizedAccount =
                normalizeTokenAccount(account);

            if (normalizedAccount) {
                normalized.push(normalizedAccount);
            }
        }

        if (unsafeNumericAmount) {
            throw new Error(
                'Helius getTokenAccounts returned an unsafe numeric amount above JavaScript safe-integer precision. Refusing to use an imprecise balance.'
            );
        }

        totalDiscovered += accounts.length;

        yield {
            page,
            strategy: 'helius-getTokenAccounts',
            tokenAccounts: normalized,
            discoveredAccounts: accounts.length,
            totalDiscoveredAccounts: totalDiscovered,
            totalResults:
                Number.isFinite(Number(result.total))
                    ? Number(result.total)
                    : null,
            skippedAccounts:
                accounts.length - normalized.length,
            lastIndexedSlot:
                Number.isFinite(Number(result.last_indexed_slot))
                    ? Number(result.last_indexed_slot)
                    : null
        };

        const nextCursor =
            typeof result.cursor === 'string' &&
            result.cursor.length > 0
                ? result.cursor
                : null;

        if (accounts.length === 0 && !nextCursor) {
            break;
        }

        if (!nextCursor) {
            break;
        }

        if (nextCursor === cursor) {
            throw new Error(
                'Helius getTokenAccounts returned the same cursor twice.'
            );
        }

        cursor = nextCursor;
        page += 1;
    }

    if (page > (runtimeConfig.tokenScanMaxPages || 100000)) {
        throw new Error(
            'Maximum token scan page limit reached. Snapshot aborted for safety.'
        );
    }
}

async function* fetchStandardProgramAccountsPages(
    runtimeConfig,
    mintInfo,
    options = {}
) {
    const signal = options.signal || null;
    const rpcUrls = getRpcUrls(runtimeConfig);
    const tokenProgramId = resolveTokenProgramId(
        mintInfo,
        runtimeConfig
    );

    const mint = new PublicKey(
        runtimeConfig.mintAddress
    ).toBase58();

    console.warn(
        '[rpcEngine] Using standard getProgramAccounts fallback. This provider does not offer cursor pagination; large scans may be slow.'
    );

    const params = [
        tokenProgramId,
        {
            commitment: runtimeConfig.commitment,
            encoding: 'base64',
            withContext: true,
            filters: [
                {
                    memcmp: {
                        offset: 0,
                        bytes: mint
                    }
                }
            ],
            dataSlice: {
                offset: 32,
                length: 40
            }
        }
    ];

    const payload = await withRpcFailover(
        rpcUrls,
        (rpcUrl, rpcIndex) => rpcPostJson(
            rpcUrl,
            'getProgramAccounts',
            params,
            {
                label: 'getProgramAccounts fallback',
                attempts:
                    runtimeConfig.tokenScanRequestAttempts || 2,
                timeoutMs:
                    Math.max(
                        runtimeConfig.tokenScanRequestTimeoutMs || 60_000,
                        120_000
                    ),
                requestId:
                    `standard-gpa-${rpcIndex}`,
                signal
            }
        ),
        {
            label: 'getProgramAccounts fallback',
            signal
        }
    );

    const result = payload?.result;

    const accounts = Array.isArray(result)
        ? result
        : Array.isArray(result?.value)
            ? result.value
            : [];

    const slot =
        Number.isInteger(result?.context?.slot)
            ? result.context.slot
            : null;

    const decimals = Number(
        mintInfo?.value?.data?.parsed?.info?.decimals || 0
    );

    const normalized = [];

    for (const account of accounts) {
        const address = normalizePubkey(
            account?.pubkey || account?.address
        );

        if (!address || !account?.account?.data) {
            continue;
        }

        try {
            const decoded = decodeTokenAccountSlice(
                account.account.data
            );

            normalized.push({
                address,
                owner: decoded.owner,
                amount: decoded.amount,
                decimals
            });
        } catch {
            // Skip malformed account payloads.
        }
    }

    yield {
        page: 1,
        strategy: 'standard-getProgramAccounts',
        tokenProgramId,
        tokenAccounts: normalized,
        discoveredAccounts: accounts.length,
        totalDiscoveredAccounts: normalized.length,
        skippedAccounts:
            accounts.length - normalized.length,
        slot
    };
}

async function* fetchTokenAccountPages(
    runtimeConfig,
    mintInfo,
    options = {}
) {
    const provider = runtimeConfig.tokenScanProvider || 'auto';
    const heliusUrls = getHeliusRpcUrls(runtimeConfig);
    const signal = options.signal || null;

    let firstError = null;

    async function* streamAfterFirstPage(iterator, firstPage) {
        yield firstPage.value;

        while (true) {
            const next = await iterator.next();

            if (next.done) {
                return;
            }

            yield next.value;
        }
    }

    async function* tryInitialPage(label, factory) {
        throwIfAborted(signal);

        const iterator = factory();
        let firstPage;

        try {
            firstPage = await iterator.next();
        } catch (error) {
            firstError = error;
            console.warn(
                `[rpcEngine] ${label} initial page failed:`,
                error?.message || error
            );

            try {
                await iterator.return?.();
            } catch {
                // The initial page has already failed; preserve the original error.
            }

            return false;
        }

        if (firstPage.done) {
            throw new Error(
                `${label} produced no pages.`
            );
        }

        for await (const page of streamAfterFirstPage(
            iterator,
            firstPage
        )) {
            yield page;
        }

        return true;
    }

    if (
        (provider === 'auto' || provider === 'helius-v2') &&
        heliusUrls.length > 0
    ) {
        const strategy = tryInitialPage(
            'Helius getProgramAccountsV2 scan',
            () => fetchHeliusProgramAccountsV2Pages(
                runtimeConfig,
                mintInfo,
                { signal }
            )
        );

        const first = await strategy.next();

        if (!first.done) {
            yield first.value;

            while (true) {
                const next = await strategy.next();

                if (next.done) {
                    return;
                }

                yield next.value;
            }
        }
    }

    if (
        (provider === 'auto' ||
            provider === 'helius-token-accounts' ||
            provider === 'helius-v2') &&
        heliusUrls.length > 0
    ) {
        const strategy = tryInitialPage(
            'Helius getTokenAccounts scan',
            () => fetchHeliusTokenAccountsPages(
                runtimeConfig,
                { signal }
            )
        );

        const first = await strategy.next();

        if (!first.done) {
            yield first.value;

            while (true) {
                const next = await strategy.next();

                if (next.done) {
                    return;
                }

                yield next.value;
            }
        }
    }

    if (
        provider === 'helius-v2' ||
        provider === 'helius-token-accounts'
    ) {
        throw firstError || new Error(
            'Configured Helius token scan provider failed.'
        );
    }

    const standardIterator =
        fetchStandardProgramAccountsPages(
            runtimeConfig,
            mintInfo,
            { signal }
        );

    try {
        const first = await standardIterator.next();

        if (first.done) {
            throw new Error(
                'Standard getProgramAccounts returned no pages.'
            );
        }

        yield first.value;

        while (true) {
            const next = await standardIterator.next();

            if (next.done) {
                return;
            }

            yield next.value;
        }
    } catch (error) {
        if (firstError) {
            error.cause = firstError;
        }

        throw error;
    }
}

async function fetchClusterUnixTimestampSmart(
    runtimeConfig,
    options = {}
) {
    const signal = options.signal || null;
    const rpcUrls = getRpcUrls(runtimeConfig);

    const payload = await withRpcFailover(
        rpcUrls,
        (rpcUrl, rpcIndex) => rpcPostJson(
            rpcUrl,
            'getAccountInfo',
            [
                'SysvarC1ock11111111111111111111111111111111',
                {
                    commitment: runtimeConfig.commitment,
                    encoding: 'base64',
                    dataSlice: {
                        offset: 32,
                        length: 8
                    }
                }
            ],
            {
                label: 'getAccountInfo Clock sysvar',
                attempts:
                    runtimeConfig.rpcRequestAttempts || 2,
                timeoutMs:
                    runtimeConfig.rpcMintTimeoutMs || 20_000,
                requestId:
                    `clock-${rpcIndex}`,
                signal
            }
        ),
        {
            label: 'getAccountInfo Clock sysvar',
            signal
        }
    );

    const data = payload?.result?.value?.data;

    try {
        const buffer = bufferFromRpcData(data);

        if (buffer.length < 8) {
            throw new Error(
                `Clock sysvar data too short: ${buffer.length} bytes`
            );
        }

        const unixTimestamp = Number(
            buffer.readBigInt64LE(0)
        );

        if (!Number.isSafeInteger(unixTimestamp)) {
            throw new Error(
                'Clock sysvar unix timestamp is outside JavaScript safe integer range.'
            );
        }

        return unixTimestamp;
    } catch (error) {
        throw new Error(
            `Unable to decode Solana Clock sysvar unix timestamp: ${error.message}`
        );
    }
}

// Compatibility helper. New snapshot code should consume the async generator
// so token-account pages never need to be held in memory at once.
async function fetchTokenAccountsByMintSmart(
    runtimeConfig,
    mintInfoInput = null,
    options = {}
) {
    const signal = options.signal || null;

    const mintInfo =
        mintInfoInput ||
        await fetchMintInfoSmart(
            runtimeConfig,
            { signal }
        );

    if (!mintInfo?.value) {
        throw new Error(
            `Mint account not found: ${runtimeConfig.mintAddress}`
        );
    }

    const pages = [];
    let tokenProgramId = null;
    let discoveredAccounts = 0;
    let skippedAccounts = 0;
    let strategy = null;

    for await (const page of fetchTokenAccountPages(
        runtimeConfig,
        mintInfo,
        { signal }
    )) {
        pages.push(...page.tokenAccounts);
        tokenProgramId =
            page.tokenProgramId ||
            tokenProgramId;
        discoveredAccounts +=
            Number(page.discoveredAccounts || 0);
        skippedAccounts += Number(
            page.skippedAccounts || 0
        );
        strategy = page.strategy;
    }

    return {
        tokenProgramId,
        strategy,
        discoveredAccounts,
        skippedAccounts,
        tokenAccounts: pages
    };
}

module.exports = {
    getRpcUrls,
    getHeliusRpcUrls,
    isHeliusRpcUrl,
    isRetryableRpcError,
    rpcPostJson,
    withRpcFailover,
    fetchMintInfoSmart,
    fetchClusterUnixTimestampSmart,
    fetchTokenAccountPages,
    fetchTokenAccountsByMintSmart,
    decodeTokenAccountSlice,
    normalizeTokenAccount
};
