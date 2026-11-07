'use strict';

const {
    fetchMintInfoSmart,
    fetchClusterUnixTimestampSmart,
    fetchTokenAccountPages
} = require('./rpcEngine');

const {
    createHolderAggregator
} = require('./holderParser');

const {
    resolveTokenProgramId
} = require('./rpc');



function getParsedMintInfo(mintInfo) {
    return mintInfo?.value?.data?.parsed?.info || null;
}

function normalizeRawInteger(value, fieldName) {
    const raw = String(value ?? '').trim();

    if (!/^\d+$/.test(raw)) {
        throw new TypeError(
            `${fieldName} must be a non-negative integer string.`
        );
    }

    return BigInt(raw).toString();
}

function buildUiAmountConfig(
    mintInfo,
    currentTimestampSeconds = null
) {
    const info = getParsedMintInfo(mintInfo);
    const extensions =
        Array.isArray(info?.extensions)
            ? info.extensions
            : [];

    const scaled = extensions.find(
        extension =>
            String(extension?.extension || '') ===
            'scaledUiAmountConfig'
    );

    const interestBearing = extensions.find(
        extension =>
            String(extension?.extension || '') ===
            'interestBearingConfig'
    );

    if (scaled && interestBearing) {
        throw new Error(
            'Mint exposes both ScaledUiAmountConfig and InterestBearingConfig. Token-2022 does not permit this extension combination.'
        );
    }

    if (!scaled && !interestBearing) {
        return {
            mode: 'standard'
        };
    }

    if (!Number.isSafeInteger(currentTimestampSeconds)) {
        throw new TypeError(
            'A valid Solana cluster timestamp is required for special Token-2022 UI amount extensions.'
        );
    }

    const state = scaled?.state || interestBearing?.state;

    if (scaled) {
        return {
            mode: 'scaled',
            multiplier: state?.multiplier,
            newMultiplier: state?.newMultiplier,
            newMultiplierEffectiveTimestamp:
                state?.newMultiplierEffectiveTimestamp,
            currentTimestampSeconds
        };
    }

    return {
        mode: 'interest-bearing',
        currentTimestampSeconds,
        lastUpdateTimestamp:
            state?.lastUpdateTimestamp,
        initializationTimestamp:
            state?.initializationTimestamp,
        preUpdateAverageRate:
            state?.preUpdateAverageRate,
        currentRate:
            state?.currentRate
    };
}

function validateAggregatedHolders(parsed) {
    if (
        !parsed ||
        !Array.isArray(parsed.holders)
    ) {
        throw new TypeError(
            'Invalid aggregated holder result.'
        );
    }

    if (parsed.holderCount !== parsed.holders.length) {
        throw new Error(
            `Holder count mismatch: declared=${parsed.holderCount}, actual=${parsed.holders.length}.`
        );
    }

    const wallets = new Set();
    let sum = 0n;

    for (const holder of parsed.holders) {
        const wallet = String(
            holder?.wallet || ''
        ).trim();

        if (!wallet) {
            throw new Error(
                'Aggregated holder contains an empty wallet.'
            );
        }

        if (wallets.has(wallet)) {
            throw new Error(
                `Duplicate holder wallet detected: ${wallet}`
            );
        }

        wallets.add(wallet);

        const raw = normalizeRawInteger(
            holder.rawAmount,
            `rawAmount for ${wallet}`
        );

        sum += BigInt(raw);
    }

    const declaredTotal = normalizeRawInteger(
        parsed.totalRawAmount,
        'totalRawAmount'
    );

    if (sum !== BigInt(declaredTotal)) {
        throw new Error(
            `Aggregated raw balance mismatch: sum=${sum.toString()}, declared=${declaredTotal}.`
        );
    }
}

async function takeSnapshot(
    runtimeConfig,
    options = {}
) {
    const startedAt = Date.now();

    const onProgress =
        typeof options.onProgress === 'function'
            ? options.onProgress
            : null;

    const db = options.db || null;

    // ---------------------------------------------------------
    // 1. Mint metadata
    // ---------------------------------------------------------
    const signal = options.signal || null;

    if (signal?.aborted) {
        throw (signal.reason || new Error('Snapshot aborted.'));
    }

    const mintInfo = await fetchMintInfoSmart(
        runtimeConfig,
        { signal }
    );

    if (!mintInfo?.value) {
        throw new Error(
            `Mint account not found: ${runtimeConfig.mintAddress}`
        );
    }

    const tokenProgramId = resolveTokenProgramId(
        mintInfo,
        runtimeConfig
    );

    const parsedMintInfo = getParsedMintInfo(mintInfo);

    const decimals = Number(
        parsedMintInfo?.decimals
    );

    if (
        !Number.isSafeInteger(decimals) ||
        decimals < 0 ||
        decimals > 255
    ) {
        throw new TypeError(
            `Invalid mint decimals: ${parsedMintInfo?.decimals}`
        );
    }

    const mintSupplyRaw = normalizeRawInteger(
        parsedMintInfo?.supply,
        'mint supply'
    );

    const extensions =
        Array.isArray(parsedMintInfo?.extensions)
            ? parsedMintInfo.extensions
            : [];

    const hasSpecialUiExtension = extensions.some(
        extension =>
            extension?.extension === 'scaledUiAmountConfig' ||
            extension?.extension === 'interestBearingConfig'
    );

    let currentTimestampSeconds = null;

    if (hasSpecialUiExtension) {
        currentTimestampSeconds =
            await fetchClusterUnixTimestampSmart(
                runtimeConfig,
                { signal }
            );
    }

    const uiAmountConfig = buildUiAmountConfig(
        mintInfo,
        currentTimestampSeconds
    );

    // ---------------------------------------------------------
    // 2. Streaming token-account aggregation
    //
    // We never build a giant token-account array.
    // Each page is consumed and discarded immediately after
    // aggregation.
    // ---------------------------------------------------------
    const aggregator = createHolderAggregator(
        runtimeConfig.mintAddress,
        decimals,
        { uiAmountConfig }
    );

    let pages = 0;
    let scanStrategy = null;
    let rawDiscoveredAccounts = 0;
    let malformedAccounts = 0;
    let scanSlot = null;
    let lastProgressAccounts = 0;

    for await (const page of fetchTokenAccountPages(
        runtimeConfig,
        mintInfo,
        { signal }
    )) {
        if (signal?.aborted) {
            throw (signal.reason || new Error('Snapshot aborted.'));
        }
        pages += 1;
        scanStrategy =
            page.strategy ||
            scanStrategy;

        const tokenAccounts =
            Array.isArray(page.tokenAccounts)
                ? page.tokenAccounts
                : [];

        aggregator.addPage(
            tokenAccounts
        );

        rawDiscoveredAccounts += Number(
            page.discoveredAccounts || 0
        );

        malformedAccounts += Number(
            page.skippedAccounts || 0
        );

        if (Number.isInteger(page.slot)) {
            scanSlot = page.slot;
        }

        const shouldLog =
            pages === 1 ||
            pages % (
                runtimeConfig.progressLogEveryPages || 10
            ) === 0 ||
            aggregator.discoveredTokenAccounts -
                lastProgressAccounts >=
                (
                    runtimeConfig.progressLogEveryAccounts ||
                    100000
                );

        if (shouldLog) {
            lastProgressAccounts =
                aggregator.discoveredTokenAccounts;

            console.info(
                `[Holder Engine] [Snapshot] ` +
                `pages=${pages} ` +
                `tokenAccounts=${aggregator.discoveredTokenAccounts} ` +
                `holders=${aggregator.holderCount} ` +
                `strategy=${scanStrategy}`
            );

            if (onProgress) {
                await onProgress({
                    phase: 'scan',
                    pages,
                    tokenAccounts:
                        aggregator.discoveredTokenAccounts,
                    holders:
                        aggregator.holderCount,
                    strategy: scanStrategy
                });
            }
        }
    }

    if (pages === 0) {
        throw new Error(
            'Token scan returned zero pages; snapshot cannot be published.'
        );
    }

    // ---------------------------------------------------------
    // 3. Finalize unique holders
    // ---------------------------------------------------------
    const parsed = aggregator.finalize();

    validateAggregatedHolders(parsed);

    console.info(
        `[Holder Engine] [Snapshot] Aggregation completed. ` +
        `tokenAccounts=${parsed.discoveredTokenAccounts} ` +
        `nonZeroAccounts=${parsed.processedTokenAccounts} ` +
        `holders=${parsed.holderCount} ` +
        `skipped=${parsed.skippedTokenAccounts}`
    );

    if (parsed.holderCount === 0) {
        throw new Error(
            'Snapshot contains zero positive-balance holders. Publish aborted.'
        );
    }

    // Snapshot service owns only blockchain acquisition and aggregation.
    // Classification and Ranking are separate background services.
    const generatedAt = new Date().toISOString();

    return {
        meta: {
            generatedAt,
            scanDurationMs: Date.now() - startedAt,
            tokenProgramId,
            mintSupplyRaw,
            observedHolderBalanceRaw: parsed.totalRawAmount,
            uiAmountMode: uiAmountConfig.mode,
            uiAmountTimestampSeconds: currentTimestampSeconds,
            scanSlot,
            scanStrategy,
            scanPages: pages,
            rawDiscoveredTokenAccounts: rawDiscoveredAccounts,
            discoveredTokenAccounts: parsed.discoveredTokenAccounts,
            malformedTokenAccounts: malformedAccounts,
            processedTokenAccounts: parsed.processedTokenAccounts,
            skippedTokenAccounts: parsed.skippedTokenAccounts,
            duplicateTokenAccounts: parsed.duplicateTokenAccounts,
            zeroTokenAccounts: parsed.zeroTokenAccounts
        },
        mintAddress: runtimeConfig.mintAddress,
        holderCount: parsed.holderCount,
        totalRawAmount: parsed.totalRawAmount,
        mintSupplyRaw,
        observedHolderBalanceRaw: parsed.totalRawAmount,
        decimals: parsed.decimals,
        holders: parsed.holders.map(holder => ({
            ...holder
        }))
    };
}

module.exports = {
    takeSnapshot
};
