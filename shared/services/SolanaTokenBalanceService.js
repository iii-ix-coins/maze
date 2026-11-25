'use strict';

const DEFAULT_SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';

class InvalidSolanaAddressError extends TypeError {
    constructor(label) {
        super(`Invalid Solana ${label} address.`);
        this.name = 'InvalidSolanaAddressError';
    }
}

function formatRawTokenAmount(rawAmount, decimals) {
    const raw = BigInt(rawAmount);
    const places = Number(decimals);
    if (!Number.isInteger(places) || places < 0 || places > 255) {
        throw new TypeError('Token decimals must be an integer between 0 and 255.');
    }
    if (places === 0) return raw.toString();

    const scale = 10n ** BigInt(places);
    const whole = raw / scale;
    const fraction = (raw % scale).toString().padStart(places, '0').replace(/0+$/, '');
    return fraction ? `${whole.toString()}.${fraction}` : whole.toString();
}

class SolanaTokenBalanceService {
    constructor({
        rpcUrl = process.env.SOLANA_RPC_URL || DEFAULT_SOLANA_RPC_URL,
        commitment = 'confirmed',
        cacheTtlMs = 10_000,
        connection,
        PublicKey: PublicKeyConstructor,
    } = {}) {
        if (!connection || !PublicKeyConstructor) {
            const { Connection, PublicKey } = require('@solana/web3.js');
            this.connection = connection || new Connection(rpcUrl, commitment);
            this.PublicKey = PublicKeyConstructor || PublicKey;
        } else {
            this.connection = connection;
            this.PublicKey = PublicKeyConstructor;
        }

        this.commitment = commitment;
        this.cacheTtlMs = Math.max(0, Number(cacheTtlMs) || 0);
        this.cache = new Map();
        this.inFlight = new Map();
    }

    createPublicKey(value, label) {
        if (typeof value !== 'string' || !value.trim()) {
            throw new InvalidSolanaAddressError(label);
        }
        try {
            return new this.PublicKey(value.trim());
        } catch {
            throw new InvalidSolanaAddressError(label);
        }
    }

    async getTokenBalance(ownerAddress, mintAddress) {
        const owner = this.createPublicKey(ownerAddress, 'owner');
        const mint = this.createPublicKey(mintAddress, 'mint');
        const ownerBase58 = owner.toBase58();
        const mintBase58 = mint.toBase58();
        const cacheKey = `${ownerBase58}:${mintBase58}`;
        const now = Date.now();
        const cached = this.cache.get(cacheKey);

        if (cached && cached.expiresAt > now) return cached.value;
        if (this.inFlight.has(cacheKey)) return this.inFlight.get(cacheKey);

        const request = this.readTokenBalance(owner, mint, ownerBase58, mintBase58)
            .then((value) => {
                if (this.cacheTtlMs > 0) {
                    this.cache.set(cacheKey, {
                        value,
                        expiresAt: Date.now() + this.cacheTtlMs,
                    });
                }
                if (this.cache.size > 2000) {
                    const currentTime = Date.now();
                    for (const [key, entry] of this.cache) {
                        if (entry.expiresAt <= currentTime) this.cache.delete(key);
                    }
                    while (this.cache.size > 1500) this.cache.delete(this.cache.keys().next().value);
                }
                return value;
            })
            .finally(() => this.inFlight.delete(cacheKey));

        this.inFlight.set(cacheKey, request);
        return request;
    }

    async readTokenBalance(owner, mint, ownerAddress, mintAddress) {
        const response = await this.connection.getParsedTokenAccountsByOwner(
            owner,
            { mint },
            this.commitment,
        );

        let rawTotal = 0n;
        let decimals = null;
        let tokenAccounts = 0;

        for (const entry of response?.value ?? []) {
            const info = entry?.account?.data?.parsed?.info;
            const tokenAmount = info?.tokenAmount;
            if (!info || !tokenAmount) continue;
            if (info.owner !== ownerAddress || info.mint !== mintAddress) continue;

            const raw = String(tokenAmount.amount ?? '');
            const accountDecimals = Number(tokenAmount.decimals);
            if (!/^\d+$/.test(raw)) throw new TypeError('Solana RPC returned an invalid token amount.');
            if (!Number.isInteger(accountDecimals) || accountDecimals < 0 || accountDecimals > 255) {
                throw new TypeError('Solana RPC returned invalid token decimals.');
            }
            if (decimals !== null && decimals !== accountDecimals) {
                throw new TypeError('Token accounts for the same mint returned inconsistent decimals.');
            }

            decimals = accountDecimals;
            rawTotal += BigInt(raw);
            tokenAccounts += 1;
        }

        if (decimals === null) {
            const supply = await this.connection.getTokenSupply(mint, this.commitment);
            decimals = Number(supply?.value?.decimals);
            if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
                throw new TypeError('Solana RPC could not determine the token mint decimals.');
            }
        }

        return {
            owner: ownerAddress,
            mintAddress,
            amountRaw: rawTotal.toString(),
            amount: formatRawTokenAmount(rawTotal, decimals),
            decimals,
            tokenAccounts,
            slot: Number.isSafeInteger(response?.context?.slot) ? response.context.slot : null,
            commitment: this.commitment,
            updatedAt: Date.now(),
        };
    }
}

module.exports = {
    DEFAULT_SOLANA_RPC_URL,
    InvalidSolanaAddressError,
    SolanaTokenBalanceService,
    formatRawTokenAmount,
};
