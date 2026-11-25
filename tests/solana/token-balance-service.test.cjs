'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    InvalidSolanaAddressError,
    SolanaTokenBalanceService,
    formatRawTokenAmount,
} = require('../../shared/services/SolanaTokenBalanceService');

class TestPublicKey {
    constructor(value) {
        if (typeof value !== 'string' || !/^(owner|mint)-[a-z0-9]+$/i.test(value)) {
            throw new Error('invalid test public key');
        }
        this.value = value;
    }

    toBase58() {
        return this.value;
    }
}

const ownerAddress = 'owner-wallet01';
const mintAddress = 'mint-token01';

function parsedAccount(amount, tokenProgram = 'spl-token') {
    return {
        account: {
            owner: tokenProgram,
            data: {
                parsed: {
                    info: {
                        owner: ownerAddress,
                        mint: mintAddress,
                        tokenAmount: {
                            amount: String(amount),
                            decimals: 6,
                        },
                    },
                },
            },
        },
    };
}

test('aggregates every parsed token account for the selected owner and mint', async () => {
    const connection = {
        async getParsedTokenAccountsByOwner(owner, filter, commitment) {
            assert.equal(owner.toBase58(), ownerAddress);
            assert.equal(filter.mint.toBase58(), mintAddress);
            assert.equal(commitment, 'confirmed');
            return {
                context: { slot: 12345 },
                value: [parsedAccount('1250000'), parsedAccount('2750000', 'spl-token-2022')],
            };
        },
    };

    const service = new SolanaTokenBalanceService({
        connection,
        PublicKey: TestPublicKey,
        cacheTtlMs: 0,
    });
    const balance = await service.getTokenBalance(ownerAddress, mintAddress);

    assert.equal(balance.amountRaw, '4000000');
    assert.equal(balance.amount, '4');
    assert.equal(balance.decimals, 6);
    assert.equal(balance.tokenAccounts, 2);
    assert.equal(balance.slot, 12345);
});

test('returns a zero balance with the mint decimals when no token account exists', async () => {
    const connection = {
        async getParsedTokenAccountsByOwner() {
            return { context: { slot: 99 }, value: [] };
        },
        async getTokenSupply(mint, commitment) {
            assert.equal(mint.toBase58(), mintAddress);
            assert.equal(commitment, 'confirmed');
            return { value: { decimals: 9 } };
        },
    };

    const service = new SolanaTokenBalanceService({
        connection,
        PublicKey: TestPublicKey,
        cacheTtlMs: 0,
    });
    const balance = await service.getTokenBalance(ownerAddress, mintAddress);

    assert.equal(balance.amountRaw, '0');
    assert.equal(balance.amount, '0');
    assert.equal(balance.decimals, 9);
    assert.equal(balance.tokenAccounts, 0);
});

test('rejects invalid owner or mint addresses before calling RPC', async () => {
    let rpcCalled = false;
    const service = new SolanaTokenBalanceService({
        connection: {
            async getParsedTokenAccountsByOwner() {
                rpcCalled = true;
                return { value: [] };
            },
        },
        PublicKey: TestPublicKey,
        cacheTtlMs: 0,
    });

    await assert.rejects(
        service.getTokenBalance('not-a-public-key', mintAddress),
        InvalidSolanaAddressError,
    );
    assert.equal(rpcCalled, false);
});

test('formats raw integer token amounts without floating-point rounding', () => {
    assert.equal(formatRawTokenAmount('12345678901234567890', 9), '12345678901.23456789');
    assert.equal(formatRawTokenAmount('1000000', 6), '1');
    assert.equal(formatRawTokenAmount('42', 0), '42');
});
