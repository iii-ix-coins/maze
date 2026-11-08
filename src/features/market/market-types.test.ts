import { describe, expect, it } from 'vitest';
import { getMarketEnvelope, getMarketToken } from './market-types';

describe('market payload adapters', () => {
  it('supports the existing wrapped market response', () => {
    const payload = { data: { mintAddress: 'mint', tokenV2: { symbol: 'HOLD' } } };
    expect(getMarketEnvelope(payload).mintAddress).toBe('mint');
    expect(getMarketToken(payload)?.symbol).toBe('HOLD');
  });

  it('supports the direct payload fallback used by the existing scripts', () => {
    const payload = { mintAddress: 'mint', tokenV2: { name: 'Hollld' } };
    expect(getMarketEnvelope(payload).mintAddress).toBe('mint');
    expect(getMarketToken(payload)?.name).toBe('Hollld');
  });

  it('returns null when market token data is not present', () => {
    expect(getMarketToken({ data: {} })).toBeNull();
  });
});
