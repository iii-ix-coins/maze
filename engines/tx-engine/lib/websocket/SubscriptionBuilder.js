'use strict';
const DEFAULT_COMMITMENT = 'confirmed';
const DEFAULT_ENCODING = 'jsonParsed';
const DEFAULT_TRANSACTION_DETAILS = 'full';
const DEFAULT_MAX_SUPPORTED_TRANSACTION_VERSION = 1;
const METHOD =
    'transactionSubscribe';
const VALID_COMMITMENTS =
    new Set([
        'processed',
        'confirmed',
        'finalized'
    ]);
const VALID_ENCODINGS =
    new Set([
        'jsonParsed',
        'base58',
        'base64',
        'base64+zstd'
    ]);
const VALID_TRANSACTION_DETAILS =
    new Set([
        'full',
        'signatures',
        'none'
    ]);
function normalizeString(
    value,
    fallback = ''
) {
    if (
        typeof value !== 'string'
    ) {
        return fallback;
    }
    const normalized =
        value.trim();
    return normalized !== ''
        ? normalized
        : fallback;
}
function normalizePositiveInteger(
    value,
    fallback
) {
    const number =
        Number(value);
    if (
        Number.isSafeInteger(number) &&
        number > 0
    ) {
        return number;
    }

    return fallback;
}
function normalizeBoolean(
    value,
    fallback
) {
    return typeof value === 'boolean'
        ? value
        : fallback;
}
function normalizeAddressList(
    value
) {
    if (!Array.isArray(value)) {
        return [];
    }
    const result = [];
    const seen = new Set();
    for (
        const item
        of value
    ) {
        const address =
            normalizeString(item);
        if (
            !address ||
            seen.has(address)
        ) {
            continue;
        }
        seen.add(address);
        result.push(address);
    }
    return result;
}
function buildFilters({
    accountInclude = [],
    accountExclude = [],
    accountRequired = [],
    failed = false
} = {}) {
    const include =
        normalizeAddressList(
            accountInclude
        );
    const exclude =
        normalizeAddressList(
            accountExclude
        );
    const required =
        normalizeAddressList(
            accountRequired
        );
    const excludeSet =
        new Set(exclude);
    const normalizedInclude =
        include.filter(
            address =>
                !excludeSet.has(
                    address
                )
        );
    const normalizedRequired =
        required.filter(
            address =>
                !excludeSet.has(
                    address
                )
        );
    const filters = {
        failed:
            normalizeBoolean(
                failed,
                false
            )
    };
    if (
        normalizedInclude.length > 0
    ) {
        filters.accountInclude =
            normalizedInclude;
    }
    if (
        normalizedExcludeList(exclude).length > 0
    ) {
        filters.accountExclude =
            normalizedExcludeList(exclude);
    }
    if (
        normalizedRequired.length > 0
    ) {
        filters.accountRequired =
            normalizedRequired;
    }
    return filters;
}
function normalizedExcludeList(
    value
) {
    return Array.isArray(value)
        ? value
        : [];
}
function buildTransactionConfig({
    commitment =
    DEFAULT_COMMITMENT,
    encoding =
    DEFAULT_ENCODING,
    transactionDetails =
    DEFAULT_TRANSACTION_DETAILS,
    maxSupportedTransactionVersion =
    DEFAULT_MAX_SUPPORTED_TRANSACTION_VERSION,
    showRewards = false,
    vote = false,
    failed = false,
    accountInclude = [],
    accountExclude = [],
    accountRequired = []
} = {}) {
    const normalizedCommitment =
        normalizeString(
            commitment,
            DEFAULT_COMMITMENT
        ).toLowerCase();
    if (
        !VALID_COMMITMENTS.has(
            normalizedCommitment
        )
    ) {
        throw new TypeError(
            `Invalid commitment: ${commitment}`
        );
    }
    const normalizedEncoding =
        normalizeString(
            encoding,
            DEFAULT_ENCODING
        );
    if (
        !VALID_ENCODINGS.has(
            normalizedEncoding
        )
    ) {
        throw new TypeError(
            `Invalid WebSocket encoding: ${encoding}`
        );
    }
    const normalizedDetails =
        normalizeString(
            transactionDetails,
            DEFAULT_TRANSACTION_DETAILS
        );
    if (
        !VALID_TRANSACTION_DETAILS.has(
            normalizedDetails
        )
    ) {
        throw new TypeError(
            `Invalid transactionDetails: ${transactionDetails}`
        );
    }
    const maxVersion =
        Number(
            maxSupportedTransactionVersion
        );
    if (
        !Number.isSafeInteger(
            maxVersion
        ) ||
        maxVersion < 0
    ) {
        throw new TypeError(
            'maxSupportedTransactionVersion must be a non-negative safe integer.'
        );
    }
    return {
        commitment:
            normalizedCommitment,
        encoding:
            normalizedEncoding,
        transactionDetails:
            normalizedDetails,
        maxSupportedTransactionVersion:
            maxVersion,
        showRewards:
            Boolean(showRewards),
        vote:
            Boolean(vote),
        ...buildFilters({
            accountInclude,
            accountExclude,
            accountRequired,
            failed
        })
    };
}
function buildTransactionSubscribe({
    id = 1,
    mintAddress,
    accountInclude,
    accountExclude = [],
    accountRequired = [],
    failed = false,
    commitment =
    DEFAULT_COMMITMENT,
    encoding =
    DEFAULT_ENCODING,
    transactionDetails =
    DEFAULT_TRANSACTION_DETAILS,
    maxSupportedTransactionVersion =
    DEFAULT_MAX_SUPPORTED_TRANSACTION_VERSION,
    showRewards = false,
    vote = false
} = {}) {
    const normalizedMint =
        normalizeString(
            mintAddress
        );
    if (!normalizedMint) {
        throw new TypeError(
            'mintAddress is required.'
        );
    }
    const safeId =
        normalizePositiveInteger(
            id,
            1
        );
    const include =
        Array.isArray(
            accountInclude
        )
            ? accountInclude
            : [
                normalizedMint
            ];
    if (
        !include.includes(
            normalizedMint
        )
    ) {
        include.unshift(
            normalizedMint
        );
    }
    const filters =
        buildFilters({
            accountInclude:
                include,
            accountExclude,
            accountRequired,
            failed
        });
    if (
        !filters.accountInclude ||
        !filters.accountInclude.includes(
            normalizedMint
        )
    ) {
        throw new Error(
            'transactionSubscribe filter must include the target mint address.'
        );
    }
    const transactionConfig =
        buildTransactionConfig({
            commitment,
            encoding,
            transactionDetails,
            maxSupportedTransactionVersion,
            showRewards,
            vote,
            failed,
            accountInclude:
                filters.accountInclude,
            accountExclude:
                filters.accountExclude,
            accountRequired:
                filters.accountRequired
        });
    return {
        jsonrpc:
            '2.0',
        id:
            safeId,
        method:
            METHOD,
        params: [
            filters,
            transactionConfig
        ]
    };
}
function buildHollldTransactionSubscription({
    mintAddress,
    id = 1,
    commitment = DEFAULT_COMMITMENT,
    maxSupportedTransactionVersion = DEFAULT_MAX_SUPPORTED_TRANSACTION_VERSION
} = {}) {
    return buildTransactionSubscribe({
        id,
        mintAddress,
        accountInclude: [
            mintAddress
        ],
        failed: false,
        commitment,
        encoding:
            DEFAULT_ENCODING,
        transactionDetails:
            DEFAULT_TRANSACTION_DETAILS,
        maxSupportedTransactionVersion:
            maxSupportedTransactionVersion,
        showRewards: false,
        vote: false
    });
}
function isValidSubscriptionRequest(
    request
) {
    if (
        !request ||
        typeof request !== 'object'
    ) {
        return false;
    }
    if (
        request.jsonrpc !== '2.0'
    ) {
        return false;
    }
    if (
        request.method !== METHOD
    ) {
        return false;
    }
    if (
        !Array.isArray(
            request.params
        ) ||
        request.params.length !== 2
    ) {
        return false;
    }
    const filters =
        request.params[0];
    const configuration =
        request.params[1];
    if (
        !filters ||
        typeof filters !== 'object'
    ) {
        return false;
    }
    if (
        !configuration ||
        typeof configuration !== 'object'
    ) {
        return false;
    }
    return true;
}
function serializeSubscription(
    request
) {
    if (
        !isValidSubscriptionRequest(
            request
        )
    ) {
        throw new TypeError(
            'Invalid transactionSubscribe request.'
        );
    }
    return JSON.stringify(
        request
    );
}
module.exports = {
    METHOD,
    buildFilters,
    buildTransactionConfig,
    buildTransactionSubscribe,
    buildHollldTransactionSubscription,
    isValidSubscriptionRequest,
    serializeSubscription
};
