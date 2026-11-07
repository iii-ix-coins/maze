'use strict';

function pickTokenInfo(tokenResponse, mintAddress) {
    if (!Array.isArray(tokenResponse)) {
        return null;
    }

    return tokenResponse.find(
        item => String(item?.id ?? '').trim() === mintAddress
    ) || null;
}

function normalizeInteger(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    const number = Number(value);
    return Number.isSafeInteger(number) ? number : null;
}

function normalizeNumber(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function clone(value) {
    if (value === undefined) {
        return undefined;
    }

    return JSON.parse(JSON.stringify(value));
}

function buildNormalizedMarketData({
    mintAddress,
    priceResponse,
    tokenResponse,
    fetchedAtMs = Date.now()
}) {
    const mint = String(mintAddress ?? '').trim();

    if (!mint) {
        throw new TypeError('mintAddress is required.');
    }

    const price =
        priceResponse &&
        typeof priceResponse === 'object'
            ? priceResponse[mint] || null
            : null;

    const token =
        pickTokenInfo(tokenResponse, mint);

    return {
        schemaVersion: 1,
        mintAddress: mint,
        fetchedAtMs,
        fetchedAt: new Date(fetchedAtMs).toISOString(),

        availability: {
            priceV3: Boolean(price),
            tokensV2: Boolean(token)
        },

        priceV3: {
            usdPrice: normalizeNumber(price?.usdPrice),
            blockId: normalizeInteger(price?.blockId),
            decimals: normalizeInteger(price?.decimals),
            priceChange24h: normalizeNumber(price?.priceChange24h)
        },

        tokenV2: token
            ? {
                id: token.id ?? null,
                name: token.name ?? null,
                symbol: token.symbol ?? null,
                icon: token.icon ?? null,
                decimals: normalizeInteger(token.decimals),
                circSupply: token.circSupply ?? null,
                totalSupply: token.totalSupply ?? null,
                tokenProgram: token.tokenProgram ?? null,

                firstPool: clone(token.firstPool) ?? null,
                holderCount: normalizeInteger(token.holderCount),

                audit: clone(token.audit) ?? null,

                organicScore: normalizeNumber(token.organicScore),
                organicScoreLabel:
                    token.organicScoreLabel ?? null,

                isVerified:
                    typeof token.isVerified === 'boolean'
                        ? token.isVerified
                        : null,

                tags: Array.isArray(token.tags)
                    ? [...token.tags]
                    : [],

                fdv: token.fdv ?? null,
                mcap: token.mcap ?? null,
                usdPrice: token.usdPrice ?? null,
                priceBlockId: normalizeInteger(token.priceBlockId),
                liquidity: token.liquidity ?? null,

                stats5m: clone(token.stats5m) ?? null,
                stats1h: clone(token.stats1h) ?? null,
                stats6h: clone(token.stats6h) ?? null,
                stats24h: clone(token.stats24h) ?? null,

                updatedAt: token.updatedAt ?? null
            }
            : null,

        consistency: {
            usdPriceDelta: null,
            liquidityDelta: null,
            priceBlockMatches: null
        },

        raw: {
            priceV3: clone(priceResponse) ?? null,
            tokensV2: clone(tokenResponse) ?? null
        }
    };
}

function addConsistency(previous, current) {
    if (!current || typeof current !== 'object') {
        return current;
    }

    const result = clone(current);

    const previousUsdPrice =
        normalizeNumber(previous?.tokenV2?.usdPrice ?? previous?.priceV3?.usdPrice);

    const currentUsdPrice =
        normalizeNumber(result?.tokenV2?.usdPrice ?? result?.priceV3?.usdPrice);

    const previousLiquidity =
        normalizeNumber(previous?.tokenV2?.liquidity);

    const currentLiquidity =
        normalizeNumber(result?.tokenV2?.liquidity);

    const previousBlock =
        normalizeInteger(previous?.tokenV2?.priceBlockId ?? previous?.priceV3?.blockId);

    const currentBlock =
        normalizeInteger(result?.tokenV2?.priceBlockId ?? result?.priceV3?.blockId);

    result.consistency = {
        usdPriceDelta:
            previousUsdPrice !== null &&
            currentUsdPrice !== null
                ? currentUsdPrice - previousUsdPrice
                : null,

        liquidityDelta:
            previousLiquidity !== null &&
            currentLiquidity !== null
                ? currentLiquidity - previousLiquidity
                : null,

        priceBlockMatches:
            previousBlock !== null &&
            currentBlock !== null
                ? previousBlock === currentBlock
                : null
    };

    return result;
}

module.exports = {
    buildNormalizedMarketData,
    addConsistency
};
