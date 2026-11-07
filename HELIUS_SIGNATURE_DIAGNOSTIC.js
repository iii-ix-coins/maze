'use strict';

// Run from the Hollld project root: node HELIUS_SIGNATURE_DIAGNOSTIC.js
// Reads .env locally and never prints API keys.
try { require('dotenv').config({ quiet: true }); } catch (_) {}

const mint = String(process.env.MINT_ADDRESS || '').trim();
const apiKeys = String(process.env.HELIUS_API_KEYS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

if (!mint) {
  console.error('CONFIG_ERROR: MINT_ADDRESS is missing from environment/.env');
  process.exit(2);
}
if (!apiKeys.length) {
  console.error('CONFIG_ERROR: HELIUS_API_KEYS is missing from environment/.env');
  process.exit(2);
}

const endpoint = key => `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(key)}`;

async function rpc(label, key, method, params, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(endpoint(key), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal
    });
    const body = await response.text();
    const elapsed = Date.now() - started;
    let json;
    try { json = JSON.parse(body); } catch (_) { json = null; }

    if (!response.ok) {
      console.log(`${label}: HTTP_${response.status} elapsed=${elapsed}ms body=${body.slice(0, 300)}`);
      return { ok: false, elapsed };
    }
    if (json && json.error) {
      console.log(`${label}: RPC_ERROR elapsed=${elapsed}ms code=${json.error.code} message=${String(json.error.message || '').slice(0, 300)}`);
      return { ok: false, elapsed, rpcError: true };
    }
    if (!json || !Object.prototype.hasOwnProperty.call(json, 'result')) {
      console.log(`${label}: INVALID_JSON_RESPONSE elapsed=${elapsed}ms body=${body.slice(0, 300)}`);
      return { ok: false, elapsed };
    }
    if (method === 'getSignaturesForAddress') {
      console.log(`${label}: OK elapsed=${elapsed}ms signatures=${Array.isArray(json.result) ? json.result.length : 'unexpected-result'} limit=${params[1].limit}`);
      if (Array.isArray(json.result) && json.result.length) {
        console.log(`${label}: newest=${json.result[0].signature} oldest=${json.result[json.result.length - 1].signature}`);
      }
    } else {
      console.log(`${label}: OK elapsed=${elapsed}ms result=${JSON.stringify(json.result).slice(0, 150)}`);
    }
    return { ok: true, elapsed, result: json.result };
  } catch (error) {
    const elapsed = Date.now() - started;
    const cause = error && error.cause;
    console.log(`${label}: ${controller.signal.aborted ? 'TIMEOUT' : 'FETCH_ERROR'} elapsed=${elapsed}ms error=${String(error && error.message || error).slice(0, 180)} cause=${String(cause && (cause.code || cause.message) || '').slice(0, 120)}`);
    return { ok: false, elapsed, timeout: controller.signal.aborted };
  } finally {
    clearTimeout(timer);
  }
}

(async () => {
  console.log(`Target mint: ${mint}`);
  console.log(`API keys loaded: ${apiKeys.length} (values are hidden)`);
  console.log('--- Test A: small health request ---');
  await rpc('getHealth/key1', apiKeys[0], 'getHealth', [], 10000);

  console.log('--- Test B: signature lookup, limit=10 ---');
  const small = await rpc('getSignatures/limit10/key1', apiKeys[0], 'getSignaturesForAddress', [mint, { commitment: 'confirmed', limit: 10 }], 15000);

  console.log('--- Test C: signature lookup, limit=1000 ---');
  const large = await rpc('getSignatures/limit1000/key1', apiKeys[0], 'getSignaturesForAddress', [mint, { commitment: 'confirmed', limit: 1000 }], 20000);

  if (!small.ok && apiKeys.length > 1) {
    console.log('--- Test D: retry small signature lookup on key2 ---');
    await rpc('getSignatures/limit10/key2', apiKeys[1], 'getSignaturesForAddress', [mint, { commitment: 'confirmed', limit: 10 }], 15000);
  }

  console.log('--- Diagnostic summary ---');
  if (small.ok && large.ok) {
    console.log('SIGNATURE_RPC_OK: both small and maximum-size signature requests succeeded; investigate app process configuration/provider wiring next.');
  } else if (small.ok && !large.ok) {
    console.log('LARGE_PAGE_SLOW: small requests work but limit=1000 does not; test a page limit of 100 or 250 in the application.');
  } else {
    console.log('SIGNATURE_RPC_FAILING: this reproduces outside the engine; focus on Helius archival access/service limits/network path, not SQLite.');
  }
})().catch(error => {
  console.error('DIAGNOSTIC_FATAL:', error && error.stack || error);
  process.exitCode = 1;
});
