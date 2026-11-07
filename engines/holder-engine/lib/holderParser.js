'use strict';

const { formatTokenAmount } = require('./utils');

const SECONDS_PER_YEAR = 60 * 60 * 24 * 365.24;
const BASIS_POINTS = 10_000;

function normalizeWallet(value) {
    if (!value) {
        return '';
    }

    if (typeof value === 'string') {
        return value.trim();
    }

    if (typeof value.toBase58 === 'function') {
        return value.toBase58();
    }

    if (typeof value.toString === 'function') {
        return value.toString();
    }

    return '';
}

function normalizeRawAmount(value) {
    const raw = String(value ?? '').trim();

    if (!/^\d+$/.test(raw)) {
        return null;
    }

    return BigInt(raw);
}

function normalizeDecimals(value) {
    const decimals = Number(value);

    if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 255) {
        throw new RangeError(
            `Invalid token decimals: ${value}`
        );
    }

    return decimals;
}

function normalizeFiniteNumber(value, name) {
    const n = Number(value);

    if (!Number.isFinite(n)) {
        throw new TypeError(
            `${name} must be a finite number.`
        );
    }

    return n;
}

function normalizeTimestamp(value, name) {
    const n = Number(value);

    if (!Number.isSafeInteger(n)) {
        throw new TypeError(
            `${name} must be a safe integer timestamp.`
        );
    }

    return n;
}

function floorBigIntTimesPositiveNumber(rawAmount, factor, name) {
    const numericFactor = Number(factor);

    if (!Number.isFinite(numericFactor) || numericFactor <= 0) {
        throw new RangeError(
            `${name} must be finite and greater than zero.`
        );
    }

    const text = numericFactor.toString().toLowerCase();
    const match = text.match(/^([0-9]+)(?:\.([0-9]+))?(?:e([+-]?\d+))?$/);

    if (!match) {
        throw new RangeError(
            `${name} has an unsupported numeric representation.`
        );
    }

    const integerPart = match[1] || '0';
    const fractionPart = match[2] || '';
    const exponent = Number(match[3] || 0);

    if (!Number.isSafeInteger(exponent)) {
        throw new RangeError(
            `${name} exponent is outside the safe integer range.`
        );
    }

    const digits = `${integerPart}${fractionPart}`
        .replace(/^0+(?=\d)/, '');

    const coefficient = BigInt(digits || '0');
    const decimalScale = fractionPart.length - exponent;

    if (decimalScale <= 0) {
        return rawAmount * coefficient * (
            10n ** BigInt(-decimalScale)
        );
    }

    const divisor = 10n ** BigInt(decimalScale);
    return (
        rawAmount * coefficient
    ) / divisor;
}

function getCurrentScaledMultiplier(
    config,
    currentTimestampSeconds
) {
    const multiplier = normalizeFiniteNumber(
        config.multiplier,
        'scaledUiAmountConfig.multiplier'
    );

    const newMultiplier = normalizeFiniteNumber(
        config.newMultiplier ?? multiplier,
        'scaledUiAmountConfig.newMultiplier'
    );

    if (multiplier <= 0 || newMultiplier <= 0) {
        throw new RangeError(
            'Scaled UI amount multipliers must be greater than zero.'
        );
    }

    const effectiveTimestamp =
        config.newMultiplierEffectiveTimestamp !== undefined &&
        config.newMultiplierEffectiveTimestamp !== null
            ? normalizeTimestamp(
                config.newMultiplierEffectiveTimestamp,
                'scaledUiAmountConfig.newMultiplierEffectiveTimestamp'
            )
            : null;

    if (
        effectiveTimestamp !== null &&
        currentTimestampSeconds >= effectiveTimestamp
    ) {
        return newMultiplier;
    }

    return multiplier;
}

function calculateInterestScaleFactor(
    currentTimestampSeconds,
    lastUpdateTimestamp,
    initializationTimestamp,
    preUpdateAverageRate,
    currentRate
) {
    const current = normalizeTimestamp(
        currentTimestampSeconds,
        'interestBearingConfig.currentTimestamp'
    );

    const lastUpdate = normalizeTimestamp(
        lastUpdateTimestamp,
        'interestBearingConfig.lastUpdateTimestamp'
    );

    const initialization = normalizeTimestamp(
        initializationTimestamp,
        'interestBearingConfig.initializationTimestamp'
    );

    const historicalRate = normalizeFiniteNumber(
        preUpdateAverageRate,
        'interestBearingConfig.preUpdateAverageRate'
    );

    const liveRate = normalizeFiniteNumber(
        currentRate,
        'interestBearingConfig.currentRate'
    );

    if (lastUpdate < initialization) {
        throw new RangeError(
            'interestBearingConfig.lastUpdateTimestamp cannot be earlier than initializationTimestamp.'
        );
    }

    if (current < lastUpdate) {
        throw new RangeError(
            'interestBearingConfig.currentTimestamp cannot be earlier than lastUpdateTimestamp.'
        );
    }

    const preUpdateExponent =
        historicalRate * (lastUpdate - initialization) /
        (SECONDS_PER_YEAR * BASIS_POINTS);

    const postUpdateExponent =
        liveRate * (current - lastUpdate) /
        (SECONDS_PER_YEAR * BASIS_POINTS);

    const factor =
        Math.exp(preUpdateExponent) *
        Math.exp(postUpdateExponent);

    if (!Number.isFinite(factor) || factor <= 0) {
        throw new RangeError(
            'Interest-bearing UI amount scale factor is not finite and positive.'
        );
    }

    return factor;
}

function formatHolderUiAmount(
    rawAmount,
    decimals,
    uiAmountConfig = {}
) {
    const mode =
        uiAmountConfig.mode ||
        'standard';

    if (mode === 'standard') {
        return formatTokenAmount(
            rawAmount,
            decimals
        );
    }

    if (mode === 'scaled') {
        const multiplier = getCurrentScaledMultiplier(
            uiAmountConfig,
            uiAmountConfig.currentTimestampSeconds
        );

        return formatTokenAmount(
            floorBigIntTimesPositiveNumber(
                rawAmount,
                multiplier,
                'scaled UI amount multiplier'
            ),
            decimals
        );
    }

    if (mode === 'interest-bearing') {
        const factor = calculateInterestScaleFactor(
            uiAmountConfig.currentTimestampSeconds,
            uiAmountConfig.lastUpdateTimestamp,
            uiAmountConfig.initializationTimestamp,
            uiAmountConfig.preUpdateAverageRate,
            uiAmountConfig.currentRate
        );

        return formatTokenAmount(
            floorBigIntTimesPositiveNumber(
                rawAmount,
                factor,
                'interest-bearing UI amount scale factor'
            ),
            decimals
        );
    }

    throw new Error(
        `Unsupported UI amount mode: ${mode}`
    );
}

function normalizeUiAmountConfig(options = {}) {
    const config = options.uiAmountConfig;

    if (!config) {
        return { mode: 'standard' };
    }

    const mode = String(
        config.mode ||
        'standard'
    ).trim().toLowerCase();

    if (mode === 'standard') {
        return { mode };
    }

    if (mode === 'scaled') {
        return {
            mode,
            multiplier: config.multiplier,
            newMultiplier: config.newMultiplier,
            newMultiplierEffectiveTimestamp:
                config.newMultiplierEffectiveTimestamp,
            currentTimestampSeconds:
                config.currentTimestampSeconds
        };
    }

    if (mode === 'interest-bearing') {
        return {
            mode,
            currentTimestampSeconds:
                config.currentTimestampSeconds,
            lastUpdateTimestamp:
                config.lastUpdateTimestamp,
            initializationTimestamp:
                config.initializationTimestamp,
            preUpdateAverageRate:
                config.preUpdateAverageRate,
            currentRate:
                config.currentRate
        };
    }

    throw new Error(
        `Unsupported UI amount mode: ${mode}`
    );
}

function createHolderAggregator(
    mintAddress,
    decimals,
    options = {}
) {
    const normalizedDecimals = normalizeDecimals(decimals);
    const uiAmountConfig = normalizeUiAmountConfig(options);

    if (
        uiAmountConfig.mode === 'scaled' ||
        uiAmountConfig.mode === 'interest-bearing'
    ) {
        normalizeTimestamp(
            uiAmountConfig.currentTimestampSeconds,
            'uiAmountConfig.currentTimestampSeconds'
        );
    }

    const retainTokenAccounts =
        options.retainTokenAccounts === true;

    const holders = new Map();
    const seenTokenAccounts = new Map();

    let totalRawAmount = 0n;
    let discoveredTokenAccounts = 0;
    let processedTokenAccounts = 0;
    let skippedTokenAccounts = 0;
    let zeroTokenAccounts = 0;
    let duplicateTokenAccounts = 0;

    function addTokenAccount(account) {
        discoveredTokenAccounts += 1;

        const address = normalizeWallet(
            account?.address
        );

        const owner = normalizeWallet(
            account?.owner
        );

        const rawAmount = normalizeRawAmount(
            account?.amount
        );

        if (!owner || rawAmount === null) {
            skippedTokenAccounts += 1;
            return;
        }

        if (address) {
            const fingerprint =
                `${owner}\u0000${rawAmount.toString()}`;
            const previous = seenTokenAccounts.get(address);

            if (previous !== undefined) {
                duplicateTokenAccounts += 1;

                if (previous !== fingerprint) {
                    throw new Error(
                        `Conflicting duplicate token account detected for ${address}. Refusing to double-count inconsistent provider data.`
                    );
                }

                return;
            }

            seenTokenAccounts.set(
                address,
                fingerprint
            );
        }

        if (rawAmount <= 0n) {
            zeroTokenAccounts += 1;
            return;
        }

        processedTokenAccounts += 1;
        totalRawAmount += rawAmount;

        let holder = holders.get(owner);

        if (!holder) {
            holder = {
                wallet: owner,
                rawAmount: 0n,
                tokenAccountCount: 0,
                tokenAccounts: retainTokenAccounts
                    ? []
                    : undefined
            };

            holders.set(owner, holder);
        }

        holder.rawAmount += rawAmount;
        holder.tokenAccountCount += 1;

        if (
            retainTokenAccounts &&
            address
        ) {
            holder.tokenAccounts.push(address);
        }
    }

    function addPage(tokenAccounts) {
        if (!Array.isArray(tokenAccounts)) {
            throw new TypeError(
                'tokenAccounts page must be an array.'
            );
        }

        for (const account of tokenAccounts) {
            addTokenAccount(account);
        }
    }

    function finalize() {
        const finalizedHolders = Array.from(
            holders.values()
        )
            .sort((a, b) => {
                if (a.rawAmount === b.rawAmount) {
                    return a.wallet.localeCompare(
                        b.wallet
                    );
                }

                return a.rawAmount > b.rawAmount
                    ? -1
                    : 1;
            })
            .map(holder => {
                const result = {
                    wallet: holder.wallet,
                    rawAmount: holder.rawAmount.toString(),
                    uiAmount: formatHolderUiAmount(
                        holder.rawAmount,
                        normalizedDecimals,
                        uiAmountConfig
                    ),
                    tokenAccountCount:
                        holder.tokenAccountCount
                };

                if (retainTokenAccounts) {
                    result.tokenAccounts =
                        holder.tokenAccounts;
                }

                return result;
            });

        return {
            mint: mintAddress,
            decimals: normalizedDecimals,
            holderCount: finalizedHolders.length,
            totalRawAmount:
                totalRawAmount.toString(),
            discoveredTokenAccounts,
            processedTokenAccounts,
            skippedTokenAccounts,
            zeroTokenAccounts,
            duplicateTokenAccounts,
            holders: finalizedHolders
        };
    }

    return {
        get holderCount() {
            return holders.size;
        },

        get discoveredTokenAccounts() {
            return discoveredTokenAccounts;
        },

        get processedTokenAccounts() {
            return processedTokenAccounts;
        },

        get skippedTokenAccounts() {
            return skippedTokenAccounts;
        },

        get duplicateTokenAccounts() {
            return duplicateTokenAccounts;
        },

        addTokenAccount,
        addPage,
        finalize
    };
}

// Compatibility helper for older callers.
function parseTokenAccounts(
    tokenAccounts,
    mintAddress,
    options = {}
) {
    if (!Array.isArray(tokenAccounts)) {
        throw new TypeError(
            `Expected tokenAccounts to be an array, got: ${typeof tokenAccounts}`
        );
    }

    const decimals = Number(
        options.decimals ??
        tokenAccounts.find(account =>
            account?.decimals !== undefined
        )?.decimals ??
        0
    );

    const aggregator = createHolderAggregator(
        mintAddress,
        decimals,
        options
    );

    aggregator.addPage(tokenAccounts);

    return aggregator.finalize();
}

module.exports = {
    createHolderAggregator,
    parseTokenAccounts,
    formatHolderUiAmount
};
