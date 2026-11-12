import { useEffect, useState } from 'react';
import type { MarketPayload } from './market-types';
import { trackPageReadiness } from '../../app/page-readiness';

export interface MarketDataState {
  payload: MarketPayload | null;
  loading: boolean;
  error: string | null;
}

/** Mirrors the legacy market poll: GET /api/jupiter-market every 30 seconds, no-store. */
export function useMarketData(refreshInterval = 30_000): MarketDataState {
  const [state, setState] = useState<MarketDataState>({
    payload: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let active = true;
    let requestController: AbortController | null = null;
    let requestSequence = 0;

    const load = async () => {
      const currentRequest = ++requestSequence;
      requestController?.abort();
      const controller = new AbortController();
      requestController = controller;

      try {
        const response = await fetch('/api/jupiter-market', {
          method: 'GET',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Market request failed: ${response.status}`);
        const payload = await response.json() as MarketPayload;
        if (!active || currentRequest !== requestSequence) return;
        setState({ payload, loading: false, error: null });
      } catch (error) {
        if (!active || (error as { name?: string })?.name === 'AbortError') return;
        console.error('[Market]', error);
        setState((current) => ({
          ...current,
          loading: false,
          error: 'Market data temporarily unavailable.',
        }));
      } finally {
        if (active && currentRequest === requestSequence) requestController = null;
      }
    };

    void trackPageReadiness(load(), 'market-initial-data');
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, refreshInterval);
    const onVisibility = () => { if (!document.hidden && active) void load(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      active = false;
      window.clearInterval(timer);
      requestController?.abort();
    };
  }, [refreshInterval]);

  return state;
}
