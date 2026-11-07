'use strict';
const NATIVE_SOL_MINT = 'So11111111111111111111111111111111111111112';
const SYSTEM_PROGRAMS_AND_VAULTS = new Set([
    '11111111111111111111111111111111',
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
    'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
    '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
    'pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ',
    'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',
    '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1'
]);
class BuyerDetector {
    constructor(targetMint) {
        if (!targetMint) {
            throw new Error('Target Mint Address is required.');
        }
        this.targetMint = String(targetMint).trim();
    }
    extractPayments(raw, buyerWallet, feePayer, feeLamports) {
        const payments = [];
        const meta = raw.meta;
        if (!meta) return payments;
        const preToken = meta.preTokenBalances || [];
        const postToken = meta.postTokenBalances || [];
        const preBalances = meta.preBalances || [];
        const postBalances = meta.postBalances || [];
        const accountKeys = raw.transaction?.message?.accountKeys || [];
        const getPubkey = (index) => {
            const key = accountKeys[index];
            return typeof key === 'object' ? key.pubkey : key;
        };
        const tokenChangesMap = new Map();
        for (const pt of preToken) {
            if (pt.owner === buyerWallet && pt.mint !== this.targetMint) {
                tokenChangesMap.set(pt.mint, BigInt(pt.uiTokenAmount?.amount || '0'));
            }
        }
        for (const pt of postToken) {
            if (pt.owner === buyerWallet && pt.mint !== this.targetMint) {
                const preAmount = tokenChangesMap.get(pt.mint) || 0n;
                const postAmount = BigInt(pt.uiTokenAmount?.amount || '0');
                const diff = postAmount - preAmount;
                if (diff < 0n) {
                    const decimals = pt.uiTokenAmount?.decimals || 9;
                    const amountPaid = Number(abs(diff)) / Math.pow(10, decimals);
                    if (amountPaid > 0.000001) {
                        payments.push({
                            mint: pt.mint,
                            symbol: pt.mint === NATIVE_SOL_MINT ? 'WSOL' : 'TOKEN',
                            amountPaid: Number(amountPaid.toFixed(6))
                        });
                    }
                }
            }
        }
        let nativeSolSpent = 0;
        const checkNativeSpent = (accountAddr, isFeePayer) => {
            const idx = accountKeys.findIndex(k => getPubkey(accountKeys.indexOf(k)) === accountAddr || (typeof k === 'object' ? k.pubkey : k) === accountAddr);
            if (idx !== -1 && preBalances[idx] !== undefined && postBalances[idx] !== undefined) {
                let diff = postBalances[idx] - preBalances[idx];
                if (isFeePayer) {
                    diff += feeLamports;
                }
                if (diff < 0) {
                    nativeSolSpent += Math.abs(diff);
                }
            }
        };
        checkNativeSpent(buyerWallet, buyerWallet === feePayer);
        if (buyerWallet !== feePayer && feePayer) {
            checkNativeSpent(feePayer, true);
        }
        if (nativeSolSpent > 0) {
            const solPaid = Number((nativeSolSpent / 1e9).toFixed(6));
            if (solPaid > 0.000001) {
                payments.push({
                    mint: NATIVE_SOL_MINT,
                    symbol: 'SOL',
                    amountPaid: solPaid
                });
            }
        }
        return payments;
    }
    extractEnhancedPayments(raw, buyerWallet, feePayer, feeLamports) {
        const paymentsByMint = new Map();
        const addPayment = (mint, symbol, amountPaid) => {
            const amount = Number(amountPaid);
            if (!mint || !Number.isFinite(amount) || amount <= 0) return;
            const existing = paymentsByMint.get(mint);
            if (existing) existing.amountPaid += amount;
            else paymentsByMint.set(mint, { mint, symbol, amountPaid: amount });
        };

        const accountData = Array.isArray(raw.accountData) ? raw.accountData : [];
        for (const account of accountData) {
            if (account?.account !== buyerWallet && account?.account !== feePayer) continue;
            for (const change of (Array.isArray(account.tokenBalanceChanges) ? account.tokenBalanceChanges : [])) {
                const mint = String(change?.mint || '').trim();
                if (!mint || mint === this.targetMint) continue;

                let signedRaw = null;
                let decimals = 0;
                if (change.rawTokenAmount?.tokenAmount !== undefined) {
                    try { signedRaw = BigInt(change.rawTokenAmount.tokenAmount); } catch { signedRaw = null; }
                    decimals = Number.isInteger(Number(change.rawTokenAmount.decimals))
                        ? Math.max(0, Number(change.rawTokenAmount.decimals)) : 0;
                } else if (Number.isFinite(Number(change.tokenAmount))) {
                    // Enhanced API tokenAmount represents a UI amount and can be signed.
                    const uiAmount = Number(change.tokenAmount);
                    if (uiAmount < 0) addPayment(mint, 'TOKEN', Math.abs(uiAmount));
                    continue;
                }
                if (signedRaw !== null && signedRaw < 0n) {
                    addPayment(mint, mint === NATIVE_SOL_MINT ? 'WSOL' : 'TOKEN', Number(-signedRaw) / (10 ** decimals));
                }
            }
        }

        // Native transfers are the clearest evidence of SOL paid to a pool/router.
        let nativeLamports = 0;
        for (const transfer of (Array.isArray(raw.nativeTransfers) ? raw.nativeTransfers : [])) {
            const from = transfer?.fromUserAccount;
            const to = transfer?.toUserAccount;
            if ((from === buyerWallet || from === feePayer) && to !== buyerWallet && to !== feePayer) {
                const amount = Number(transfer.amount || 0);
                if (Number.isFinite(amount) && amount > 0) nativeLamports += amount;
            }
        }

        // Account balance differences provide a fallback when Enhanced API does not
        // emit a nativeTransfers entry for a swap (adjusting the transaction fee).
        if (nativeLamports <= 0) {
            for (const account of accountData) {
                if (account?.account !== buyerWallet && account?.account !== feePayer) continue;
                let delta = Number(account.nativeBalanceChange || 0);
                if (account.account === feePayer) delta += Number(feeLamports || 0);
                if (Number.isFinite(delta) && delta < 0) nativeLamports += Math.abs(delta);
            }
        }

        if (nativeLamports > 0) {
            addPayment('SOL', 'SOL', nativeLamports / 1e9);
        }

        return Array.from(paymentsByMint.values())
            .map(payment => ({ ...payment, amountPaid: Number(payment.amountPaid.toFixed(9)) }))
            .filter(payment => payment.amountPaid > 0);
    }

    detectEnhancedBuyers(tx, raw) {
        if (!raw || raw.transactionError || raw.err) return [];
        const signature = raw.signature || tx.signature || tx?.raw?.signature;
        if (!signature) return [];

        const blockTime = Number(raw.timestamp ?? raw.blockTime ?? tx.blockTime ?? 0) || 0;
        const feeLamports = Number(raw.fee || tx.fee || 0) || 0;
        const feePayer = raw.feePayer || null;
        const buyersByWallet = new Map();

        const addBuyer = (wallet, amount, detectedVia) => {
            if (!wallet || SYSTEM_PROGRAMS_AND_VAULTS.has(wallet)) return;
            const numericAmount = Number(amount);
            if (!Number.isFinite(numericAmount) || numericAmount <= 0) return;
            const existing = buyersByWallet.get(wallet);
            if (existing) {
                if (detectedVia === 'tokenTransfers') existing.amountBought += numericAmount;
                return;
            }
            buyersByWallet.set(wallet, { buyerWallet: wallet, amountBought: numericAmount, detectedVia });
        };

        for (const transfer of (Array.isArray(raw.tokenTransfers) ? raw.tokenTransfers : [])) {
            if (String(transfer?.mint || '').trim() !== this.targetMint) continue;
            addBuyer(transfer.toUserAccount, transfer.tokenAmount, 'tokenTransfers');
        }

        // Use balance-change data for wallets not represented by tokenTransfers.
        for (const account of (Array.isArray(raw.accountData) ? raw.accountData : [])) {
            for (const change of (Array.isArray(account?.tokenBalanceChanges) ? account.tokenBalanceChanges : [])) {
                if (String(change?.mint || '').trim() !== this.targetMint) continue;
                let amount = Number.NaN;
                if (change.rawTokenAmount?.tokenAmount !== undefined) {
                    try {
                        const rawAmount = BigInt(change.rawTokenAmount.tokenAmount);
                        if (rawAmount > 0n) {
                            const decimals = Number.isInteger(Number(change.rawTokenAmount.decimals))
                                ? Math.max(0, Number(change.rawTokenAmount.decimals)) : 0;
                            amount = Number(rawAmount) / (10 ** decimals);
                        }
                    } catch { /* ignore malformed provider amount */ }
                } else {
                    amount = Number(change.tokenAmount);
                }
                addBuyer(change.userAccount || account.account, amount, 'balanceChange');
            }
        }

        const results = [];
        for (const [buyerWallet, data] of buyersByWallet) {
            const payments = this.extractEnhancedPayments(raw, buyerWallet, feePayer, feeLamports);
            results.push({
                signature,
                blockTime,
                buyerWallet,
                amountBought: data.amountBought,
                payments,
                isPaidPurchase: payments.length > 0,
                source: raw.source || 'HELIUS_ENHANCED',
                type: raw.type || (payments.length ? 'SWAP' : 'TRANSFER'),
                detectedVia: data.detectedVia
            });
        }
        return results;
    }

    detectBuyers(transactions) {
        if (!Array.isArray(transactions)) return [];
        const buyers = [];
        for (const tx of transactions) {
            const raw = tx.raw || tx;
            if (!raw) continue;

            // Both provider modes are supported: Enhanced Transactions payloads
            // and standard Solana JSON-RPC getTransaction results.
            if (Array.isArray(raw.tokenTransfers) || Array.isArray(raw.accountData) || Array.isArray(raw.nativeTransfers)) {
                buyers.push(...this.detectEnhancedBuyers(tx, raw));
                continue;
            }

            if (!raw.meta || raw.meta.err) continue;
            const signature = (raw.transaction?.signatures && raw.transaction.signatures[0]) || tx.signature || raw.signature;
            const blockTime = tx.blockTime || raw.blockTime || 0;
            const feeLamports = raw.meta.fee || 0;
            const accountKeys = raw.transaction?.message?.accountKeys || [];
            const getPubkey = (index) => {
                const key = accountKeys[index];
                return typeof key === 'object' ? key.pubkey : key;
            };
            const feePayer = getPubkey(0);
            const preToken = raw.meta.preTokenBalances || [];
            const postToken = raw.meta.postTokenBalances || [];
            const balancesMap = new Map();
            for (const pt of preToken) {
                if (pt.mint === this.targetMint) {
                    const key = `${pt.owner || 'unknown'}_${pt.accountIndex ?? 0}`;
                    balancesMap.set(key, {
                        owner: pt.owner,
                        account: pt.accountIndex,
                        preAmount: BigInt(pt.uiTokenAmount?.amount || '0'),
                        decimals: pt.uiTokenAmount?.decimals || 6
                    });
                }
            }
            for (const pt of postToken) {
                if (pt.mint === this.targetMint) {
                    const key = `${pt.owner || 'unknown'}_${pt.accountIndex ?? 0}`;
                    let item = balancesMap.get(key);
                    if (!item) {
                        item = {
                            owner: pt.owner,
                            account: pt.accountIndex,
                            preAmount: 0n,
                            decimals: pt.uiTokenAmount?.decimals || 6
                        };
                        balancesMap.set(key, item);
                    }
                    item.postAmount = BigInt(pt.uiTokenAmount?.amount || '0');
                }
            }
            for (const [key, data] of balancesMap.entries()) {
                const pre = data.preAmount || 0n;
                const post = data.postAmount || 0n;
                const diff = post - pre;
                if (diff > 0n) {
                    const owner = data.owner || (accountKeys[data.account] && (typeof accountKeys[data.account] === 'string' ? accountKeys[data.account] : accountKeys[data.account].pubkey));
                    if (!owner || SYSTEM_PROGRAMS_AND_VAULTS.has(owner)) continue;
                    const actualAmount = Number(diff) / Math.pow(10, data.decimals);
                    const alreadyAdded = buyers.some(b => b.signature === signature && b.buyerWallet === owner);
                    if (!alreadyAdded) {
                        const payments = this.extractPayments(raw, owner, feePayer, feeLamports);
                        if (payments.length === 0) continue;
                        buyers.push({
                            signature,
                            blockTime,
                            buyerWallet: owner,
                            amountBought: actualAmount,
                            payments,
                            isPaidPurchase: 1,
                            source: raw.source || 'PUMP_FUN/DEX',
                            type: raw.type || 'SWAP',
                            detectedVia: 'universalTokenBalanceChange'
                        });
                    }
                }
            }
        }
        return buyers;
    }
}
function abs(n) {
    return n < 0n ? -n : n;
}
module.exports = BuyerDetector;