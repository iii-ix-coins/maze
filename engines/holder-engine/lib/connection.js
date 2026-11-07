const { Connection, PublicKey } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } = require('@solana/spl-token');
function createConnection(rpcUrl, commitment = 'confirmed') {
  return new Connection(rpcUrl, {
    commitment,
    confirmTransactionInitialTimeout: 60_000
  });
}
function pubkeyToString(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value.toBase58 === 'function') {
    return value.toBase58();
  }
  if (typeof value.toString === 'function') {
    return value.toString();
  }
  return '';
}
async function fetchMintInfo(connection, mintAddress, commitment) {
  const mint = new PublicKey(mintAddress);
  const mintInfo = await connection.getParsedAccountInfo(mint, commitment);
  if (mintInfo.value) {
    const owner = mintInfo.value.owner;
  }
  return mintInfo;
}
function resolveTokenProgramId(mintInfo, runtimeConfig = {}) {
  const spl = TOKEN_PROGRAM_ID.toBase58();
  const token2022 = TOKEN_2022_PROGRAM_ID.toBase58();

  if (runtimeConfig.tokenProgramIdOverride) {
    const override = new PublicKey(runtimeConfig.tokenProgramIdOverride).toBase58();

    if (override !== spl && override !== token2022) {
      throw new Error(
        `TOKEN_PROGRAM_ID must be ${spl} or ${token2022}. Received: ${override}`
      );
    }

    return override;
  }

  const owner = pubkeyToString(mintInfo?.value?.owner);
  if (!owner) {
    throw new Error('Unable to determine mint owner; cannot resolve token program.');
  }

  if (owner === spl || owner === token2022) {
    return owner;
  }

  throw new Error(
    `Mint ${owner} is not owned by the legacy SPL Token Program or Token-2022 Program. Token scan aborted.`
  );
}
async function fetchTokenAccountsByMint(connection, mintAddress, commitment, tokenProgramId) {
  const mint = new PublicKey(mintAddress);
  const programId = new PublicKey(tokenProgramId);
  return connection.getParsedProgramAccounts(programId, {
    commitment,
    filters: [
      {
        memcmp: {
          offset: 0,
          bytes: mint.toBase58()
        }
      }
    ]
  });
}
module.exports = {
  createConnection,
  fetchMintInfo,
  fetchTokenAccountsByMint,
  resolveTokenProgramId
};
