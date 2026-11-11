import { useEffect, useState } from 'react';
import { trackPageReadiness } from '../../app/page-readiness';

export interface HolderItem extends Record<string, any> {
  wallet?: string;
  rank?: number | string;
  uiAmount?: number | string;
  purchases?: number | string;
  lastPurchaseBlockTime?: number | string | null;
}

interface HoldersPayload {
  items?: HolderItem[];
  totalHolders?: number;
  snapshotTimestamp?: string | number;
}

export interface HoldersState {
  items: HolderItem[];
  totalHolders: number;
  status: 'loading' | 'ready' | 'empty' | 'error';
}

function dataVersion(data: HoldersPayload, items: HolderItem[]): string {
  const snapshot = data?.snapshotTimestamp || '';
  const itemState = items.map((item) => [
    item.rank ?? '', item.wallet ?? '', item.uiAmount ?? '',
    item.purchases ?? 0, item.lastPurchaseBlockTime ?? '',
  ].join(':')).join('|');
  return `${snapshot}::${itemState}`;
}

/** Existing holders endpoint, limit, no-store policy and five-second refresh cadence. */
export function useHolders(): HoldersState {
  const [state, setState] = useState<HoldersState>({
    items: [], totalHolders: 0, status: 'loading',
  });

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    let requestController: AbortController | null = null;
    let requestSequence = 0;
    let lastDataVersion: string | null = null;
    let hasRenderedData = false;

    const load = async () => {
      const currentRequest = ++requestSequence;
      requestController?.abort();
      const controller = new AbortController();
      requestController = controller;

      if (!hasRenderedData) {
        setState((current) => ({ ...current, status: 'loading' }));
      }

      try {
        const response = await fetch('/api/live-feed/holders?limit=100', {
          method: 'GET', cache: 'no-store', headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Holder request failed with status ${response.status}`);
        const data = await response.json() as HoldersPayload;
        if (!active || currentRequest !== requestSequence) return;
        if (!data || !Array.isArray(data.items)) throw new Error('Invalid holders response.');

        const rawItems = data.items.slice(0, 100);
        if (rawItems.length === 0) {
          setState({ items: [], totalHolders: 0, status: 'empty' });
          lastDataVersion = null;
          hasRenderedData = false;
          return;
        }

        // Match the legacy version check before filtering malformed display rows.
        const version = dataVersion(data, rawItems);
        if (hasRenderedData && version === lastDataVersion) return;

        const items = rawItems.filter((item) => item && typeof item.wallet === 'string' && item.wallet.length > 0);
        const total = Number(data.totalHolders);
        setState({
          items,
          totalHolders: Number.isFinite(total) ? total : rawItems.length,
          status: 'ready',
        });
        lastDataVersion = version;
        hasRenderedData = true;
      } catch (error) {
        if (!active || (error as { name?: string })?.name === 'AbortError') return;
        console.error('Failed to load holders:', error);
        if (!hasRenderedData) setState({ items: [], totalHolders: 0, status: 'error' });
      } finally {
        if (active && currentRequest === requestSequence) requestController = null;
      }
    };

    void trackPageReadiness(load(), 'holders-initial-data').finally(() => {
      if (active) timer = window.setInterval(() => void load(), 5000);
    });

    return () => {
      active = false;
      if (timer !== undefined) window.clearInterval(timer);
      requestController?.abort();
    };
  }, []);

  return state;
}
