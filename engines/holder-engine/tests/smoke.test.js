'use strict';

const assert = require('node:assert/strict');
const {
    createHolderAggregator,
    parseTokenAccounts,
    formatHolderUiAmount
} = require('../lib/holderParser');
const {
    formatTokenAmount,
    sleep,
    throwIfAborted
} = require('../lib/utils');

async function main() {
    assert.equal(formatTokenAmount('1234500', 4), '123.45');
    assert.equal(formatTokenAmount(0n, 9), '0');
    assert.equal(formatTokenAmount(-123n, 2), '-1.23');

    const parsed = parseTokenAccounts([
        { address: 'token-account-a', owner: 'wallet-a', amount: '1250' },
        { address: 'token-account-b', owner: 'wallet-a', amount: '750' },
        { address: 'token-account-c', owner: 'wallet-b', amount: '100' },
        { address: 'token-account-zero', owner: 'wallet-c', amount: '0' }
    ], 'mint', { decimals: 2 });

    assert.equal(parsed.holderCount, 2);
    assert.equal(parsed.totalRawAmount, '2100');
    assert.equal(parsed.holders[0].wallet, 'wallet-a');
    assert.equal(parsed.holders[0].rawAmount, '2000');
    assert.equal(parsed.holders[0].uiAmount, '20');
    assert.equal(parsed.zeroTokenAccounts, 1);

    const duplicate = createHolderAggregator('mint', 0);
    duplicate.addTokenAccount({ address: 'same-account', owner: 'wallet-a', amount: '5' });
    duplicate.addTokenAccount({ address: 'same-account', owner: 'wallet-a', amount: '5' });
    assert.equal(duplicate.finalize().totalRawAmount, '5');
    assert.equal(duplicate.duplicateTokenAccounts, 1);

    const conflict = createHolderAggregator('mint', 0);
    conflict.addTokenAccount({ address: 'same-account', owner: 'wallet-a', amount: '5' });
    assert.throws(() => conflict.addTokenAccount({ address: 'same-account', owner: 'wallet-a', amount: '6' }), /Conflicting duplicate/);

    assert.equal(formatHolderUiAmount(123n, 2, { uiAmountConfig: { mode: 'standard' } }), '1.23');
    assert.equal(formatHolderUiAmount(100n, 2, {
        mode: 'scaled',
        multiplier: 1.5,
        currentTimestampSeconds: 100
    }), '1.5');

    const controller = new AbortController();
    controller.abort(new Error('stop-now'));
    assert.throws(() => throwIfAborted(controller.signal), /stop-now/);
    assert.throws(() => sleep(1000, controller.signal), /stop-now/);

    console.log('All holder-engine smoke tests passed.');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
