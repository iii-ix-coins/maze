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
