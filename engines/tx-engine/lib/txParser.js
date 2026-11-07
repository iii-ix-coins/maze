const { formatTokenAmount } = require('./utils');
const BENIGN_PROGRAM_IDS = new Set([
  '11111111111111111111111111111111',
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
  'ComputeBudget111111111111111111111111111111',
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
  'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo',
  'AddressLookupTab1e1111111111111111111111111'
]);
const BENIGN_PROGRAM_NAMES = new Set([
  'system',
  'systemProgram',
  'spl-token',
  'token',
  'spl-token-2022',
  'token-2022',
  'spl-associated-token-account',
  'associatedToken',
  'spl-memo',
  'memo',
  'computeBudget',
  'addressLookupTable'
]);
function getPubkeyString(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value.toBase58 === 'function') {
    return value.toBase58();
  }
  if (value.pubkey && typeof value.pubkey.toBase58 === 'function') {
    return value.pubkey.toBase58();
  }
  if (typeof value.toString === 'function') {
    return value.toString();
  }
  return '';
}
function safeBigInt(value) {
  try {
    return BigInt(value ?? '0');
  } catch {
    return 0n;
  }
}
function normalizeAccountKeys(tx) {
  const keys = tx?.transaction?.message?.accountKeys || [];
  return keys.map((key, index) => {
    if (typeof key === 'string') {
      return {
        index,
        pubkey: key,
        signer: false,
        writable: false
      };
    }
    return {
      index,
      pubkey: getPubkeyString(key.pubkey || key),
      signer: Boolean(key.signer),
      writable: Boolean(key.writable)
    };
  });
}
function getInstructionProgramId(instruction, accountKeys) {
  if (!instruction) return null;
  if (typeof instruction.programId === 'string') {
    return instruction.programId;
  }
  if (instruction.programId?.toBase58) {
    return instruction.programId.toBase58();
  }
  if (typeof instruction.program === 'string') {
    return null;
  }
  if (typeof instruction.programIdIndex === 'number' && accountKeys[instruction.programIdIndex]) {
    return accountKeys[instruction.programIdIndex].pubkey;
  }
  return null;
}
function getInstructionProgramName(instruction) {
  if (!instruction) return null;
  if (typeof instruction.program === 'string') {
    return instruction.program;
  }
  if (typeof instruction.programName === 'string') {
    return instruction.programName;
  }
  return null;
}
function isBenignProgram(programId, programName) {
  return BENIGN_PROGRAM_IDS.has(programId) || BENIGN_PROGRAM_NAMES.has(programName);
}
function collectProgramHints(tx) {
  const accountKeys = normalizeAccountKeys(tx);
  const seen = new Map();
  const addInstruction = (instruction, source) => {
    const programId = getInstructionProgramId(instruction, accountKeys);
    const programName = getInstructionProgramName(instruction);
    if (!programId && !programName) {
      return;
    }
    const key = `${programId || ''}|${programName || ''}`;
    if (!seen.has(key)) {
      seen.set(key, {
        programId: programId || null,
        programName: programName || null,
        sources: new Set([source])
      });
    } else {
      seen.get(key).sources.add(source);
    }
  };
  const topLevelInstructions = tx?.transaction?.message?.instructions || [];
  for (const instruction of topLevelInstructions) {
    addInstruction(instruction, 'top-level');
  }
  const innerGroups = tx?.meta?.innerInstructions || [];
  for (const group of innerGroups) {
    const innerInstructions = group?.instructions || [];
    for (const instruction of innerInstructions) {
      addInstruction(instruction, 'inner');
    }
  }
  const programs = Array.from(seen.values()).map((entry) => ({
    programId: entry.programId,
    programName: entry.programName,
    sources: Array.from(entry.sources)
  }));
  const routePrograms = programs.filter((program) => !isBenignProgram(program.programId, program.programName));
  return {
    programs,
    routePrograms
  };
}
function collectTokenBalanceChanges(tx, mintAddress) {
  const meta = tx?.meta || {};
  const preBalances = Array.isArray(meta.preTokenBalances) ? meta.preTokenBalances : [];
  const postBalances = Array.isArray(meta.postTokenBalances) ? meta.postTokenBalances : [];
  const accountKeys = normalizeAccountKeys(tx);
  const changesByIndex = new Map();
  const upsertBalance = (balance, kind) => {
    if (!balance || !balance.mint) return;
    const accountIndex = balance.accountIndex;
    const decimals = Number.isInteger(balance?.uiTokenAmount?.decimals)
      ? balance.uiTokenAmount.decimals
      : 0;
    if (!changesByIndex.has(accountIndex)) {
      changesByIndex.set(accountIndex, {
        accountIndex,
        account: accountKeys[accountIndex]?.pubkey || null,
        owner: balance.owner || null,
        ownerKnown: Boolean(balance.owner),
        mint: balance.mint,
        decimals,
        preRawAmount: '0',
        postRawAmount: '0'
      });
    }
    const entry = changesByIndex.get(accountIndex);
    if (!entry.owner && balance.owner) {
      entry.owner = balance.owner;
      entry.ownerKnown = true;
    }
    entry.mint = balance.mint;
    entry.decimals = decimals;
    const rawAmount = balance?.uiTokenAmount?.amount ?? '0';
    if (kind === 'pre') {
      entry.preRawAmount = rawAmount;
    } else {
      entry.postRawAmount = rawAmount;
    }
  };
  preBalances.forEach((balance) => upsertBalance(balance, 'pre'));
  postBalances.forEach((balance) => upsertBalance(balance, 'post'));
  const allTokenBalanceChanges = Array.from(changesByIndex.values())
    .map((entry) => {
      const preRaw = safeBigInt(entry.preRawAmount);
      const postRaw = safeBigInt(entry.postRawAmount);
      const deltaRaw = postRaw - preRaw;
      return {
        accountIndex: entry.accountIndex,
        account: entry.account || null,
        owner: entry.owner || null,
        ownerKnown: entry.ownerKnown,
        mint: entry.mint,
        decimals: entry.decimals,
        preRawAmount: preRaw.toString(),
        postRawAmount: postRaw.toString(),
        deltaRawAmount: deltaRaw.toString(),
        preUiAmount: formatTokenAmount(preRaw, entry.decimals),
        postUiAmount: formatTokenAmount(postRaw, entry.decimals),
        deltaUiAmount: formatTokenAmount(deltaRaw, entry.decimals)
      };
    })
    .filter((entry) => entry.deltaRawAmount !== '0')
    .sort((a, b) => {
      const aRaw = safeBigInt(a.deltaRawAmount);
      const bRaw = safeBigInt(b.deltaRawAmount);
      const absA = aRaw < 0n ? -aRaw : aRaw;
      const absB = bRaw < 0n ? -bRaw : bRaw;
      if (absA === absB) {
        return String(a.mint).localeCompare(String(b.mint)) || a.accountIndex - b.accountIndex;
      }
      return absB > absA ? 1 : -1;
    });
  const targetTokenBalanceChanges = allTokenBalanceChanges.filter((entry) => entry.mint === mintAddress);
  const counterTokenBalanceChanges = allTokenBalanceChanges.filter((entry) => entry.mint !== mintAddress);
  return {
    allTokenBalanceChanges,
    targetTokenBalanceChanges,
    counterTokenBalanceChanges
  };
}
function collectNativeBalanceChanges(tx) {
  const meta = tx?.meta || {};
  const accountKeys = normalizeAccountKeys(tx);
  const preBalances = Array.isArray(meta.preBalances) ? meta.preBalances : [];
  const postBalances = Array.isArray(meta.postBalances) ? meta.postBalances : [];
  return accountKeys
    .map((key, index) => {
      const preLamports = BigInt(preBalances[index] ?? 0);
      const postLamports = BigInt(postBalances[index] ?? 0);
      const deltaLamports = postLamports - preLamports;
      return {
        accountIndex: index,
        account: key.pubkey,
        signer: key.signer,
        writable: key.writable,
        preLamports: preLamports.toString(),
        postLamports: postLamports.toString(),
        deltaLamports: deltaLamports.toString()
      };
    })
    .filter((entry) => entry.deltaLamports !== '0')
    .sort((a, b) => {
      const aRaw = safeBigInt(a.deltaLamports);
      const bRaw = safeBigInt(b.deltaLamports);
      const absA = aRaw < 0n ? -aRaw : aRaw;
      const absB = bRaw < 0n ? -bRaw : bRaw;
      if (absA === absB) {
        return a.accountIndex - b.accountIndex;
      }
      return absB > absA ? 1 : -1;
    });
}
function buildOwnerDeltaMap(changes) {
  const map = new Map();
  for (const change of changes) {
    if (!change?.owner) continue;
    const delta = safeBigInt(change.deltaRawAmount);
    map.set(change.owner, (map.get(change.owner) || 0n) + delta);
  }
  return map;
}
function chooseDominantByAbs(items, valueGetter) {
  let best = null;
  let bestAbs = -1n;
  for (const item of items) {
    const value = safeBigInt(valueGetter(item));
    const absValue = value < 0n ? -value : value;
    if (absValue > bestAbs) {
      best = { item, value };
      bestAbs = absValue;
    }
  }
  return best;
}
function resolveParticipants(tx, tokenChanges) {
  const accountKeys = normalizeAccountKeys(tx);
  const knownChanges = tokenChanges.targetTokenBalanceChanges.filter(
    (change) => change.ownerKnown
  );
  let sender = null;
  let receiver = null;
  let senderAbs = -1n;
  let receiverAbs = -1n;
  for (const change of knownChanges) {
    const delta = safeBigInt(change.deltaRawAmount);
    const absDelta = delta < 0n ? -delta : delta;
    if (delta < 0n && absDelta > senderAbs) {
      sender = change.owner;
      senderAbs = absDelta;
    }
    if (delta > 0n && absDelta > receiverAbs) {
      receiver = change.owner;
      receiverAbs = absDelta;
    }
  }
  const initiator =
    accountKeys.find((account) => account.signer)?.pubkey || null;
  return {
    sender,
    receiver,
    initiator
  };
}
function classifyTransaction(tx, mintAddress, tokenChanges, nativeBalanceChanges, programHints) {
  const knownTargetChanges = tokenChanges.targetTokenBalanceChanges.filter((c) => c.ownerKnown);
  const knownCounterChanges = tokenChanges.counterTokenBalanceChanges.filter((c) => c.ownerKnown);
  const targetOwnerDeltas = buildOwnerDeltaMap(knownTargetChanges);
  const counterOwnerDeltas = buildOwnerDeltaMap(knownCounterChanges);
  const positiveTargetOwners = Array.from(targetOwnerDeltas.entries())
    .filter(([, delta]) => delta > 0n)
    .map(([owner, delta]) => ({ owner, delta }));
  const negativeTargetOwners = Array.from(targetOwnerDeltas.entries())
    .filter(([, delta]) => delta < 0n)
    .map(([owner, delta]) => ({ owner, delta }));
  const hasTokenCounter = tokenChanges.counterTokenBalanceChanges.length > 0;
  const hasRoutePrograms = programHints.routePrograms.length > 0;
  const tradeEvidence = hasTokenCounter || hasRoutePrograms;
  const signerNativeChanges = nativeBalanceChanges.filter((change) => change.signer);
  const dominantSigner = chooseDominantByAbs(signerNativeChanges, (change) => change.deltaLamports);
  const participants = resolveParticipants(
    tx,
    tokenChanges
  );
  let buyer = null;
  let seller = null;
  let transactionType = tradeEvidence
    ? 'swap'
    : 'transfer';
  let tradeSide = null;
  let counterAssetType = 'NONE';
  if (tradeEvidence) {
    const buyByTokenCounter = positiveTargetOwners.some(({ owner }) =>
      tokenChanges.counterTokenBalanceChanges.some(
        (change) => (change.owner || null) === owner && safeBigInt(change.deltaRawAmount) < 0n
      )
    );
    const sellByTokenCounter = negativeTargetOwners.some(({ owner }) =>
      tokenChanges.counterTokenBalanceChanges.some(
        (change) => (change.owner || null) === owner && safeBigInt(change.deltaRawAmount) > 0n
      )
    );
    if (buyByTokenCounter) {
      tradeSide = 'buy';
    } else if (sellByTokenCounter) {
      tradeSide = 'sell';
    } else if (dominantSigner) {
      if (dominantSigner.value < 0n && positiveTargetOwners.length > 0) {
        tradeSide = 'buy';
      } else if (dominantSigner.value > 0n && negativeTargetOwners.length > 0) {
        tradeSide = 'sell';
      }
    }
    if (transactionType === 'swap') {
      if (tradeSide === 'buy') {
        buyer = participants.receiver;
        seller = participants.sender;
      } else if (tradeSide === 'sell') {
        buyer = participants.sender;
        seller = participants.receiver;
      }
    }
    if (hasTokenCounter) {
      counterAssetType = 'TOKEN';
    } else if (hasRoutePrograms) {
      counterAssetType = 'SOL';
    }
    if (!tradeSide) {
      tradeSide = 'unknown';
    }
  }
  const counterMints = Array.from(new Set(tokenChanges.counterTokenBalanceChanges.map((change) => change.mint)));
  return {
    transactionType,
    tradeSide,
    ...participants,
    buyer,
    seller,
    counterAssetType,
    counterMints,
    routePrograms: programHints.routePrograms,
    programs: programHints.programs,
    hasTradeEvidence: tradeEvidence,
    targetOwnerDeltas: Object.fromEntries(
      Array.from(targetOwnerDeltas.entries())
        .map(([owner, delta]) => [owner, delta.toString()])
    ),
    counterOwnerDeltas: Object.fromEntries(
      Array.from(counterOwnerDeltas.entries())
        .map(([owner, delta]) => [owner, delta.toString()])
    )
  };
}
function parseTransactions(transactions, mintAddress) {
  if (!Array.isArray(transactions)) {
    throw new Error(`Expected transactions to be an array, got: ${typeof transactions}`);
  }
  const parsed = transactions
    .filter(Boolean)
    .map((tx) => {
      const meta = tx?.meta || {};
      const message = tx?.transaction?.message || {};
      const signature = tx?.transaction?.signatures?.[0] || tx?.signatures?.[0] || '';
      const tokenChanges = collectTokenBalanceChanges(tx, mintAddress);
      const nativeBalanceChanges = collectNativeBalanceChanges(tx);
      const programHints = collectProgramHints(tx);
      const classification = classifyTransaction(
        tx,
        mintAddress,
        tokenChanges,
        nativeBalanceChanges,
        programHints
      );
      return {
        signature,
        slot: tx?.slot ?? null,
        blockTime: tx?.blockTime ?? null,
        confirmationStatus: tx?.confirmationStatus ?? null,
        err: meta.err ?? null,
        feeLamports: meta.fee ?? null,
        status: meta.err ? 'failed' : 'success',
        instructionCount: Array.isArray(message.instructions) ? message.instructions.length : 0,
        innerInstructionGroupCount: Array.isArray(meta.innerInstructions) ? meta.innerInstructions.length : 0,
        accountCount: Array.isArray(message.accountKeys) ? message.accountKeys.length : 0,
        tokenBalanceChanges: tokenChanges.targetTokenBalanceChanges,
        counterTokenBalanceChanges: tokenChanges.counterTokenBalanceChanges,
        nativeBalanceChanges,
        programHints,
        classification
      };
    })
    .sort((a, b) => {
      if (a.slot === b.slot) {
        return String(a.signature).localeCompare(String(b.signature));
      }
      return (b.slot ?? 0) - (a.slot ?? 0);
    });
  return {
    mint: mintAddress,
    transactionCount: parsed.length,
    transactions: parsed
  };
}
module.exports = {
  parseTransactions
};