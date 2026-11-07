export interface PublicConfigResponse {
  mintAddress: string;
}

export interface CoinAgeResponse {
  launchDate: string;
}

export interface HealthResponse {
  ok: boolean;
  service: string;
}

/** URL constants are centralized without changing any existing endpoint. */
export const API_PATHS = {
  health: '/health',
  config: '/api/config',
  coinAge: '/api/coin-age',
  livePrice: '/api/live-price',
  jupiterMarket: '/api/jupiter-market',
  jupiterMarketRaw: '/api/jupiter-market/raw',
  jupiterMarketHistory: '/api/jupiter-market/history',
  liveFeedBuyers: '/api/live-feed/buyers',
  liveFeedHolders: '/api/live-feed/holders',
  stats: '/api/stats',
  statsView: '/api/stats/view',
  statsLike: '/api/stats/like',
  statsShare: '/api/stats/share',
  holdersSummary: '/api/holders-summary',
  latestBuyers: '/api/latest-buyers',
  txState: '/api/tx-state',
} as const;
