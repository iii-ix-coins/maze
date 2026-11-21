import { useEffect, useState } from 'react';
import { API_PATHS } from '../../services/api/contracts';
import { normalizePclqchPrice, type LivePriceSnapshot } from './market-types';

export interface LivePriceState {
  snapshot: LivePriceSnapshot | null;
  loading: boolean;
  error: string | null;
}

const INITIAL_STATE: LivePriceState = { snapshot: null, loading: true, error: null };
const DEFAULT_REFRESH_INTERVAL = 5_000;

/**
 * Reads the latest PCLQCH engine snapshot. The engine itself updates independently;
 * the browser polls only while this summary is mounted and the tab is visible.
 * This deliberately does not increase the 30-second Jupiter market polling rate.
 */
export function useLivePrice(refreshInterval = DEFAULT_REFRESH_INTERVAL): LivePriceState {
  const [state, setState] = useState<LivePriceState>(INITIAL_STATE);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    let controller: AbortController | null = null;
    let timeoutId: number | null = null;

    const load = async () => {
      if (!active || document.hidden || inFlight) return;

      inFlight = true;
      const currentController = new AbortController();
      controller = currentController;
      let timedOut = false;
      timeoutId = window.setTimeout(() => {
        timedOut = true;
        currentController.abort();
      }, Math.max(4_000, refreshInterval));

      try {
        const response = await fetch(API_PATHS.livePrice, {
          method: 'GET',
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
          signal: currentController.signal,
        });

        if (!response.ok) {
          throw new Error(`PCLQCH price request failed: ${response.status}`);
        }

        const payload: unknown = await response.json();
        const snapshot = normalizePclqchPrice(payload);
        if (!snapshot) throw new Error('PCLQCH returned an invalid price snapshot.');
        if (!active) return;

        setState((current) => {
          const currentUpdatedAt = current.snapshot?.updatedAt ?? 0;
          const nextUpdatedAt = snapshot.updatedAt ?? 0;
          // Do not let a delayed/stale response replace a newer engine snapshot.
          if (current.snapshot && nextUpdatedAt > 0 && currentUpdatedAt > nextUpdatedAt) {
            return { ...current, loading: false, error: null };
          }
          return { snapshot, loading: false, error: null };
        });
      } catch (error) {
        if (!active) return;
        if ((error as { name?: string })?.name === 'AbortError' && !timedOut) return;
        setState((current) => ({
          ...current,
          loading: false,
          error: 'Live price is temporarily unavailable.',
        }));
      } finally {
        if (timeoutId !== null) window.clearTimeout(timeoutId);
        timeoutId = null;
        if (controller === currentController) controller = null;
        inFlight = false;
      }
    };

    void load();
    const intervalId = window.setInterval(() => {
      if (!document.hidden) void load();
    }, Math.max(2_000, refreshInterval));

    const handleVisibilityChange = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      controller?.abort();
    };
  }, [refreshInterval]);

  return state;
}
