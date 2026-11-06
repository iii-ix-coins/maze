const fs = require('fs/promises');
const path = require('path');
const { PublicKey } = require('@solana/web3.js');
const { config } = require('../config');
const { createConnection, fetchMintInfo } = require('./rpc');
const { parseTransactions } = require('./txParser');
const { saveJsonAtomic } = require('./fileManager');
const { sleep } = require('./utils');
const SPL_TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
function getIntEnv(name, fallback) {
  const value = Number(process.env[name]);
  if (Number.isInteger(value) && value >= 0) {
    return value;
  }
  return fallback;
}
const TX_LIMIT = getIntEnv('TX_LIMIT', 50);
const TX_FETCH_BATCH_SIZE = getIntEnv('TX_FETCH_BATCH_SIZE', 2);
const TX_BATCH_DELAY_MS = getIntEnv('TX_BATCH_DELAY_MS', 2000);
const TX_FETCH_DELAY_MS = getIntEnv('TX_FETCH_DELAY_MS', 1000);
const TX_RETRY_LIMIT = getIntEnv('TX_RETRY_LIMIT', 4);
const TX_RETRY_BASE_DELAY_MS = getIntEnv('TX_RETRY_BASE_DELAY_MS', 1000);
function detectTokenProgram(owner) {
  if (owner === SPL_TOKEN_PROGRAM_ID) {
    return { id: owner, type: 'spl-token' };
  }
  if (owner === TOKEN_2022_PROGRAM_ID) {
    return { id: owner, type: 'token-2022' };
  }
  throw new Error(`Unsupported token program owner: ${owner}`);
}
function getTxStateFile(runtimeConfig) {
  return path.join(path.dirname(runtimeConfig.transactionsOutputFile), 'tx-state.json');
}
async function readJsonFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    if (!raw.trim()) {
      return null;
    }
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}
async function readTxState(txStateFile, mintAddress) {
  const parsed = await readJsonFile(txStateFile);
  if (!parsed) {
    return {
      cursorSignature: null,
      updatedAt: null,
      mintAddress: null
    };
  }
  const fileMintAddress = typeof parsed?.mintAddress === 'string' ? parsed.mintAddress : null;
  if (fileMintAddress && fileMintAddress !== mintAddress) {
    console.warn('[tx] tx-state mint mismatch detected; resetting state for the current mint.');
    return {
      cursorSignature: null,
      updatedAt: null,
      mintAddress: null
    };
  }
  return {
    cursorSignature: typeof parsed?.cursorSignature === 'string' ? parsed.cursorSignature : null,
    updatedAt: typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : null,
    mintAddress: typeof parsed?.mintAddress === 'string' ? parsed.mintAddress : null
  };
}
async function writeTxState(txStateFile, state) {
  await fs.mkdir(path.dirname(txStateFile), { recursive: true });
  const tempPath = `${txStateFile}.tmp`;
  const json = `${JSON.stringify(state, null, 2)}\n`;
  await fs.writeFile(tempPath, json, 'utf8');
  await fs.rename(tempPath, txStateFile);
}
async function readExistingTransactionsSnapshot(filePath, mintAddress) {
  const parsed = await readJsonFile(filePath);
  if (!parsed) {
    return {
      transactions: [],
      meta: null
    };
  }
  const fileMintAddress = typeof parsed?.mint === 'string'
    ? parsed.mint
    : (typeof parsed?.meta?.mintAddress === 'string' ? parsed.meta.mintAddress : null);
  if (fileMintAddress && fileMintAddress !== mintAddress) {
    console.warn('[tx] existing all-transactions file belongs to another mint; starting fresh.');
    return {
      transactions: [],
      meta: null
    };
  }
  return {
    transactions: Array.isArray(parsed?.transactions) ? parsed.transactions : [],
    meta: parsed?.meta || null
  };
}
function compareTransactions(a, b) {
  const slotA = Number.isFinite(a?.slot) ? a.slot : -1;
  const slotB = Number.isFinite(b?.slot) ? b.slot : -1;
  if (slotA !== slotB) {
    return slotB - slotA;
  }
  const timeA = Number.isFinite(a?.blockTime) ? a.blockTime : -1;
  const timeB = Number.isFinite(b?.blockTime) ? b.blockTime : -1;
  if (timeA !== timeB) {
    return timeB - timeA;
  }
  return String(a?.signature || '').localeCompare(String(b?.signature || ''));
}
function mergeTransactions(existingTransactions, incomingTransactions) {
  const map = new Map();
  for (const tx of existingTransactions) {
    if (tx?.signature) {
      map.set(tx.signature, tx);
    }
  }
  for (const tx of incomingTransactions) {
    if (tx?.signature) {
      map.set(tx.signature, tx);
    }
  }
  return Array.from(map.values()).sort(compareTransactions);
}
function fetchMintOwnerProgram(owner) {
  return detectTokenProgram(owner);
}
async function fetchSignaturesPage(connection, mintAddress, commitment, before = undefined) {
  const mint = new PublicKey(mintAddress);
  const options = {
    commitment,
    limit: TX_LIMIT
  };
  if (before) {
    options.before = before;
  }
  const page = await connection.getSignaturesForAddress(mint, options);
  return Array.isArray(page) ? page : [];
}
function trimSignaturesAfterCursor(page, cursorSignature) {
  if (!cursorSignature) {
    return {
      signatures: page.map((item) => item.signature),
      reachedCursor: false
    };
  }
  const cursorIndex = page.findIndex((item) => item.signature === cursorSignature);
  if (cursorIndex === -1) {
    return {
      signatures: page.map((item) => item.signature),
      reachedCursor: false
    };
  }
  return {
    signatures: page.slice(0, cursorIndex).map((item) => item.signature),
    reachedCursor: true
  };
}
async function fetchParsedTransactionWithRetry(connection, signature, commitment) {
  let attempt = 0;
  while (true) {
    try {
      return await connection.getParsedTransaction(signature, {
        commitment,
        maxSupportedTransactionVersion: 1
      });
    } catch (error) {
      const message = String(error?.message || error || '');
      const retryable =
        message.includes('429') ||
        message.includes('Too Many Requests') ||
        message.toLowerCase().includes('fetch failed');
      if (!retryable || attempt >= TX_RETRY_LIMIT) {
        throw error;
      }
      const delayMs = TX_RETRY_BASE_DELAY_MS * (2 ** attempt);
      await sleep(delayMs);
      attempt += 1;
    }
  }
}
async function fetchParsedTransactionsFallbackSequential(connection, signatures, commitment) {
  const results = [];
  let unrecoveredFailure = false;
  for (const signature of signatures) {
    try {
      const tx = await fetchParsedTransactionWithRetry(connection, signature, commitment);
      if (tx) {
        results.push(tx);
      } else {
        unrecoveredFailure = true;
      }
    } catch (error) {
      unrecoveredFailure = true;
      console.error(`[tx] failed to fetch transaction ${signature}:`, error?.message || error);
    }
    if (TX_FETCH_DELAY_MS > 0) {
      await sleep(TX_FETCH_DELAY_MS);
    }
  }
  return {
    results,
    unrecoveredFailure
  };
}
async function fetchParsedTransactionsBatchRequestWithRetry(connection, signatures, commitment) {
  let attempt = 0;
  while (true) {
    try {
      return await connection.getParsedTransactions(signatures, {
        commitment,
        maxSupportedTransactionVersion: 1
      });
    } catch (error) {
      const message = String(error?.message || error || '');
      const retryable =
        message.includes('429') ||
        message.includes('Too Many Requests') ||
        message.toLowerCase().includes('fetch failed');
      if (!retryable || attempt >= TX_RETRY_LIMIT) {
        throw error;
      }
      const delayMs = TX_RETRY_BASE_DELAY_MS * (2 ** attempt);
      await sleep(delayMs);
      attempt += 1;
    }
  }
}
async function fetchParsedTransactionsBatch(connection, signatures, commitment) {
  const results = [];
  let batchFailed = false;
  let unrecoveredFailure = false;
  for (let i = 0; i < signatures.length; i += TX_FETCH_BATCH_SIZE) {
    const batch = signatures.slice(i, i + TX_FETCH_BATCH_SIZE);
    let parsedTransactions = null;
    try {
      parsedTransactions = await fetchParsedTransactionsBatchRequestWithRetry(
        connection,
        batch,
        commitment
      );
    } catch (error) {
      batchFailed = true;
      console.error('[tx] batch request failed:', error?.message || error);
    }
    let missingSignatures = [];
    if (Array.isArray(parsedTransactions)) {
      for (let j = 0; j < batch.length; j += 1) {
        const tx = parsedTransactions[j] || null;
        if (tx) {
          results.push(tx);
        } else {
          missingSignatures.push(batch[j]);
        }
      }
      if (parsedTransactions.length !== batch.length) {
        batchFailed = true;
      }
    } else {
      missingSignatures = batch.slice();
    }
    if (missingSignatures.length > 0) {
      batchFailed = true;
      const fallback = await fetchParsedTransactionsFallbackSequential(
        connection,
        missingSignatures,
        commitment
      );
      results.push(...fallback.results);
      if (fallback.unrecoveredFailure || fallback.results.length !== missingSignatures.length) {
        unrecoveredFailure = true;
      }
    }
    if (i + TX_FETCH_BATCH_SIZE < signatures.length && TX_BATCH_DELAY_MS > 0) {
      await sleep(TX_BATCH_DELAY_MS);
    }
  }
  return {
    results,
    batchFailed,
    unrecoveredFailure
  };
}
let cachedTokenProgram = null;
async function takeTxSnapshot(runtimeConfig = config, snapshotAt = new Date()) {
  const connection = createConnection(runtimeConfig.rpcUrls, runtimeConfig.commitment);
  const txStateFile = getTxStateFile(runtimeConfig);
  if (!cachedTokenProgram) {
    const { mintInfo, owner } = await fetchMintInfo(
      connection,
      runtimeConfig.mintAddress,
      runtimeConfig.commitment
    );
    if (!mintInfo?.value || !owner) {
      throw new Error(`Mint account not found or invalid owner: ${runtimeConfig.mintAddress}`);
    }
    cachedTokenProgram = fetchMintOwnerProgram(owner);
  }
  const tokenProgram = cachedTokenProgram;
  const state = await readTxState(txStateFile, runtimeConfig.mintAddress);
  let cursorSignature = state.cursorSignature;
  const collectedTransactions = [];
  let before = undefined;
  let reachedCursor = false;
  while (true) {
    const page = await fetchSignaturesPage(
      connection,
      runtimeConfig.mintAddress,
      runtimeConfig.commitment,
      before
    );
    if (page.length === 0) {
      break;
    }
    const { signatures, reachedCursor: pageReachedCursor } = trimSignaturesAfterCursor(page, cursorSignature);
    if (signatures.length > 0) {
      const { results: txs, batchFailed, unrecoveredFailure } = await fetchParsedTransactionsBatch(
        connection,
        signatures,
        runtimeConfig.commitment
      );
      collectedTransactions.push(...txs);
      const newestCursor = signatures[signatures.length - 1];
      if (newestCursor && !unrecoveredFailure) {
        cursorSignature = newestCursor;
      } else if (unrecoveredFailure) {
        console.warn('[tx] page had unrecovered failures; cursor was not advanced to avoid skipping signatures.');
      }
      if (batchFailed) {
        console.warn('[tx] page had batch-level fallback activity; some requests were recovered via fallback.');
      }
    }
    if (pageReachedCursor) {
      reachedCursor = true;
      break;
    }
    if (page.length < TX_LIMIT) {
      break;
    }
    before = page[page.length - 1].signature;
    if (TX_BATCH_DELAY_MS > 0) {
      await sleep(TX_BATCH_DELAY_MS);
    }
  }
  const parsed = parseTransactions(collectedTransactions, runtimeConfig.mintAddress);
  const existing = await readExistingTransactionsSnapshot(
    runtimeConfig.transactionsOutputFile,
    runtimeConfig.mintAddress
  );
  const mergedTransactions = mergeTransactions(existing.transactions, parsed.transactions);
  const snapshot = {
    meta: {
      generatedAt: snapshotAt.toISOString(),
      source: 'solana-rpc:getSignaturesForAddress+getParsedTransactions(fallback:getParsedTransaction)',
      rpcUrl: runtimeConfig.rpcUrls.join(', '),
      commitment: runtimeConfig.commitment,
      mintAddress: runtimeConfig.mintAddress,
      mintOwner: owner,
      tokenProgramId: tokenProgram.id,
      tokenProgram,
      txLimit: TX_LIMIT,
      txBatchDelayMs: TX_BATCH_DELAY_MS,
      txFetchDelayMs: TX_FETCH_DELAY_MS,
      txFetchBatchSize: TX_FETCH_BATCH_SIZE,
      reachedCursor,
      cursorSignature: cursorSignature || null,
      previousTransactionCount: existing.transactions.length,
      currentBatchTransactionCount: parsed.transactionCount,
      storedTransactionCount: mergedTransactions.length
    },
    mint: runtimeConfig.mintAddress,
    transactionCount: mergedTransactions.length,
    transactions: mergedTransactions
  };
  const savedPath = await saveJsonAtomic(runtimeConfig.transactionsOutputFile, snapshot);
  snapshot.outputFile = savedPath;
  try {
    await writeTxState(txStateFile, {
      cursorSignature,
      updatedAt: snapshotAt.toISOString(),
      mintAddress: runtimeConfig.mintAddress
    });
  } catch (error) {
    console.error(
      '[tx] snapshot was saved successfully but failed to update tx-state:',
      error?.message || error
    );
  }
  return snapshot;
}
module.exports = {
  takeTxSnapshot
};