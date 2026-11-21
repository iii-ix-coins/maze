import { describe, expect, it } from 'vitest';
import { getMarketEnvelope, getMarketToken, normalizePclqchPrice } from './market-types';

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


describe('PCLQCH live price adapter', () => {
  it('normalizes the existing price-state payload', () => {
    expect(normalizePclqchPrice({
      schemaVersion: 1,
      timestamp: '2026-11-21T10:00:00.000Z',
      priceUsd: 0.0504936422,
      provider: 'jupiter',
      changes: { '24h': 12.3456 },
      updatedAt: 1795255200000,
    })).toEqual({
      priceUsd: 0.0504936422,
      change24h: 12.3456,
      provider: 'jupiter',
      updatedAt: 1795255200000,
    });
  });

  it('uses the timestamp when updatedAt is absent and accepts unavailable 24h change', () => {
    expect(normalizePclqchPrice({
      timestamp: '2026-11-21T10:00:00.000Z',
      priceUsd: '0.0000000123',
      changes: { '24h': null },
    })).toEqual({
      priceUsd: 0.0000000123,
      change24h: null,
      provider: null,
      updatedAt: Date.parse('2026-11-21T10:00:00.000Z'),
    });
  });

  it('rejects empty, malformed and non-positive engine snapshots', () => {
    expect(normalizePclqchPrice(null)).toBeNull();
    expect(normalizePclqchPrice({ priceUsd: 0 })).toBeNull();
    expect(normalizePclqchPrice({ priceUsd: 'not-a-price' })).toBeNull();
  });
});
