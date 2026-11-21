export type UnknownRecord = Record<string, any>;

export interface MarketPayload extends UnknownRecord {
  data?: UnknownRecord;
  updatedAt?: string;
}

export function getMarketToken(payload: MarketPayload | null | undefined): UnknownRecord | null {
  const market = payload?.data || payload;
  const token = market?.tokenV2;
  return token && typeof token === 'object' ? token : null;
}

export function getMarketEnvelope(payload: MarketPayload | null | undefined): UnknownRecord {
  return (payload?.data || payload || {}) as UnknownRecord;
}


/** Public snapshot written by engines/pclqch-engine and served at /api/live-price. */
export interface PclqchPricePayload extends UnknownRecord {
  schemaVersion?: number;
  timestamp?: string;
  priceUsd?: number | string;
  provider?: string;
  changes?: Record<string, number | string | null | undefined>;
  updatedAt?: number;
}

export interface LivePriceSnapshot {
  priceUsd: number;
  change24h: number | null;
  provider: string | null;
  updatedAt: number | null;
}

/** Rejects warming-up, malformed, non-finite and non-positive engine snapshots. */
export function normalizePclqchPrice(payload: unknown): LivePriceSnapshot | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;

  const source = payload as PclqchPricePayload;
  const priceUsd = Number(source.priceUsd);
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null;

  const rawChange = source.changes?.['24h'];
  const parsedChange = rawChange === null || rawChange === undefined || rawChange === ''
    ? null
    : Number(rawChange);
  const change24h = parsedChange !== null && Number.isFinite(parsedChange)
    ? parsedChange
    : null;

  const rawUpdatedAt = Number(source.updatedAt);
  const timestampMs = source.timestamp ? Date.parse(source.timestamp) : Number.NaN;
  const updatedAt = Number.isFinite(rawUpdatedAt) && rawUpdatedAt > 0
    ? rawUpdatedAt
    : Number.isFinite(timestampMs) && timestampMs > 0
      ? timestampMs
      : null;

  const provider = typeof source.provider === 'string' && source.provider.trim()
    ? source.provider.trim()
    : null;

  return { priceUsd, change24h, provider, updatedAt };
}
