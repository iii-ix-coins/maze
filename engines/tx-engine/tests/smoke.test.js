'use strict';

const assert = require('node:assert/strict');
const TxQueue = require('../lib/TxEngine/TxQueue');
const Transaction = require('../lib/TxEngine/models/Transaction');
const HeliusProvider = require('../lib/TxEngine/providers/helius');
const SignatureScanner = require('../lib/TxEngine/scanner/SignatureScanner');
const TransactionHistory = require('../lib/TxEngine/storage/transactionHistory');
const BuyerDetector = require('../lib/buyerDetector');
const TxPipeline = require('../lib/TxPipeline');

async function testQueueRunAndConcurrency() {
    const queue = new TxQueue({ concurrency: 2 });
    let active = 0;
    let maxActive = 0;
    const results = await queue.run([1, 2, 3, 4].map(value => async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise(resolve => setTimeout(resolve, 3));
        active--;
        return value * 2;
    }));
    assert.deepEqual(results, [2, 4, 6, 8]);
    assert.equal(maxActive, 2);
    await queue.onIdle();
    assert.equal(queue.idle(), true);
}

async function testQueueClearRejectsPending() {
    const queue = new TxQueue({ concurrency: 1 });
    let release;
    const running = queue.add(() => new Promise(resolve => { release = resolve; }));
    const pending = queue.add(() => 'must not run');
    assert.equal(queue.clear(), 1);
    await assert.rejects(pending, /queue cleared/i);
    release('done');
    assert.equal(await running, 'done');
    await queue.onIdle();
}

async function testEnhancedBatchPreservesSignatureOrder() {
    const provider = new HeliusProvider({ apiKeys: ['test-key'], retries: 0, mode: 'enhanced' });
    const originalFetch = global.fetch;
    global.fetch = async (url, options) => {
        assert.match(String(url), /api\.helius\.xyz\/v0\/transactions/);
        const payload = JSON.parse(options.body);
        assert.deepEqual(payload.transactions, ['first', 'second']);
        // The endpoint's response order is deliberately reversed. The provider
        // maps results by signature, not by response-array position.
        return {
            ok: true,
            status: 200,
            json: async () => [
                { signature: 'second', slot: 20, tokenTransfers: [] },
                { signature: 'first', slot: 10, tokenTransfers: [] }
            ]
        };
    };
    try {
        const transactions = await provider.getEnhancedTransactions(['first', 'second']);
        assert.deepEqual(transactions.map(tx => tx.signature), ['first', 'second']);
    } finally {
        global.fetch = originalFetch;
    }
}

async function testRpcBatchPreservesOrder() {
    const provider = new HeliusProvider({ apiKeys: ['test-key'], retries: 0, mode: 'rpc' });
    const originalFetch = global.fetch;
    global.fetch = async (_url, options) => {
        const payload = JSON.parse(options.body);
        assert.equal(payload.length, 2);
        return {
            ok: true,
            status: 200,
            json: async () => [
                { jsonrpc: '2.0', id: 2, result: { transaction: { signatures: ['second'] } }, slot: 2 },
                { jsonrpc: '2.0', id: 1, result: { transaction: { signatures: ['first'] } }, slot: 1 }
            ]
        };
    };
    try {
        const transactions = await provider.getEnhancedTransactions(['first', 'second']);
        assert.deepEqual(transactions.map(tx => tx.transaction.signatures[0]), ['first', 'second']);
    } finally {
        global.fetch = originalFetch;
    }
}

async function testSignatureScannerLimitAndContinuationState() {
    const pages = [
        [
            { signature: 'newest', slot: 30 },
            { signature: 'middle', slot: 20 }
        ],
        [
            { signature: 'older', slot: 10 }
        ]
    ];
    const txEngine = {
        async fetchSignatures(_wallet, options) {
            assert.equal(options.until, 'old-boundary');
            if (options.before === 'cursor-boundary') return pages[0];
            if (options.before === 'middle') return pages[1];
            return [];
        }
    };
    const status = {};
    const scanner = new SignatureScanner({ txEngine, history: new TransactionHistory() });
    const results = [];
    for await (const sig of scanner.scan({
        wallet: 'mint-address',
        before: 'cursor-boundary',
        until: 'old-boundary',
        limit: 2,
        status
    })) results.push(sig.signature);
    assert.deepEqual(results, ['newest', 'middle']);
    assert.equal(status.limitReached, true);
    assert.equal(status.caughtUp, false);
    assert.equal(status.oldestSignature, 'middle');
}


async function testPipelineMaintainsNewestWatermarkAcrossLimitedRuns() {
    const state = {
        version: 1,
        mintAddress: 'mint-address',
        lastSignature: 'old-boundary',
        oldestSignature: null,
        scanCursorSignature: null,
        scanHeadSignature: null,
        totalTransactions: 0,
        scanCompleted: true
    };
    const transactionState = {
        async load() { return { ...state }; },
        async update(values) { Object.assign(state, values); return { ...state }; }
    };

    const writer = {
        buffer: [],
        async open() { this.buffer = []; },
        async append(transaction) {
            this.buffer.push(transaction);
            return { accepted: true, flushed: false, signature: transaction.signature };
        },
        async flush() {
            const items = this.buffer;
            this.buffer = [];
            return {
                success: true,
                flushed: items.length > 0,
                received: items.length,
                inserted: items.length,
                duplicates: 0,
                invalid: 0,
                persisted: items.length,
                failed: 0,
                signatures: items.map(item => item.signature)
            };
        },
        async close() { return this.flush(); }
    };

    let nextSignatures = ['newest-head', 'older-in-first-run'];
    let nextStatus = { caughtUp: false, newestSignature: 'newest-head', yielded: 2 };
    const resumeScanner = {
        status: null,
        async *scan() {
            this.status = { ...nextStatus };
            for (const signature of nextSignatures) yield { signature };
        },
        lastScanStatus() { return this.status ? { ...this.status } : null; }
    };
    const transactionScanner = {
        async *scan(signatures) {
            for await (const sig of signatures) yield { signature: sig.signature, slot: 1, blockTime: 1, raw: { signature: sig.signature } };
        }
    };

    const pipeline = new TxPipeline({ resumeScanner, transactionScanner, transactionWriter: writer, transactionState });
    await pipeline.run({ wallet: 'mint-address', limit: 2, saveEvery: 100 });
    assert.equal(state.lastSignature, 'old-boundary', 'stable until watermark must not move while backlog remains');
    assert.equal(state.scanCursorSignature, 'older-in-first-run', 'continuation cursor must move to oldest persisted item');
    assert.equal(state.scanHeadSignature, 'newest-head', 'newest head must be remembered across continuation runs');
    assert.equal(state.scanCompleted, false);

    nextSignatures = ['oldest-backlog-item'];
    nextStatus = { caughtUp: true, newestSignature: 'oldest-backlog-item', yielded: 1 };
    await pipeline.run({ wallet: 'mint-address', limit: 2, saveEvery: 100 });
    assert.equal(state.lastSignature, 'newest-head', 'after catch-up, polling watermark must become the newest signature');
    assert.equal(state.scanCursorSignature, null);
    assert.equal(state.scanHeadSignature, null);
    assert.equal(state.scanCompleted, true);
}

function testTransactionValidation() {
    const tx = Transaction.fromRpc({
        transaction: { signatures: ['signature-1'] },
        slot: 5,
        blockTime: 100,
        meta: { fee: 5000 }
    });
    assert.equal(tx.signature, 'signature-1');
    assert.equal(tx.fee, 5000);
    assert.throws(() => new Transaction({ signature: '', fee: 0 }), /signature/i);
    assert.throws(() => new Transaction({ signature: 'x', fee: -1 }), /numeric metadata/i);
}

function testEnhancedBuyerDetection() {
    const detector = new BuyerDetector('TARGET_MINT');
    const enhancedTx = {
        signature: 'enhanced-signature',
        timestamp: 1234,
        fee: 5000,
        feePayer: 'buyer-wallet',
        tokenTransfers: [
            { mint: 'TARGET_MINT', tokenAmount: 25, toUserAccount: 'buyer-wallet', fromUserAccount: 'pool-wallet' }
        ],
        nativeTransfers: [
            { fromUserAccount: 'buyer-wallet', toUserAccount: 'pool-wallet', amount: 500000000 }
        ],
        accountData: []
    };
    const buyers = detector.detectBuyers([{ ...enhancedTx, raw: enhancedTx }]);
    assert.equal(buyers.length, 1);
    assert.equal(buyers[0].buyerWallet, 'buyer-wallet');
    assert.equal(buyers[0].amountBought, 25);
    assert.equal(buyers[0].isPaidPurchase, true);
}

function testRpcBuyerDetection() {
    const detector = new BuyerDetector('TARGET_MINT');
    const raw = {
        slot: 10,
        blockTime: 1234,
        transaction: {
            signatures: ['rpc-signature'],
            message: { accountKeys: [{ pubkey: 'buyer-wallet', signer: true }, { pubkey: 'token-account' }] }
        },
        meta: {
            err: null,
            fee: 5000,
            preBalances: [2_000_000_000, 0],
            postBalances: [1_500_000_000, 0],
            preTokenBalances: [],
            postTokenBalances: [
                { accountIndex: 1, owner: 'buyer-wallet', mint: 'TARGET_MINT', uiTokenAmount: { amount: '25000000', decimals: 6 } }
            ]
        }
    };
    const buyers = detector.detectBuyers([{ signature: 'rpc-signature', blockTime: 1234, raw }]);
    assert.equal(buyers.length, 1);
    assert.equal(buyers[0].buyerWallet, 'buyer-wallet');
    assert.equal(buyers[0].isPaidPurchase, 1);
}

(async () => {
    await testQueueRunAndConcurrency();
    await testQueueClearRejectsPending();
    await testEnhancedBatchPreservesSignatureOrder();
    await testRpcBatchPreservesOrder();
    await testSignatureScannerLimitAndContinuationState();
    await testPipelineMaintainsNewestWatermarkAcrossLimitedRuns();
    testTransactionValidation();
    testEnhancedBuyerDetection();
    testRpcBuyerDetection();
    process.stdout.write('All tx-engine smoke tests passed.\n');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
