import { useCallback, useEffect, useLayoutEffect, useRef, useState, type WheelEvent } from 'react';
import { formatAmount } from '../../services/formatters';
import { trackPageReadiness } from '../../app/page-readiness';
import { API_PATHS } from '../../services/api/contracts';

type FeedItem = Record<string, any>;
type FeedStatus = 'loading' | 'ready' | 'empty' | 'error';

const FEED_LIMIT = 100;
const REFRESH_INTERVAL = 5000;
const CARD_STAGGER_STEP = 8;
const MAX_CARD_STAGGER = 80;

function shortWallet(wallet: unknown): string {
  if (typeof wallet !== 'string' || wallet.length < 12) return String(wallet || 'Unknown');
  return `${wallet.slice(0, 5)}....${wallet.slice(-4)}`;
}

function getHolderKey(item: FeedItem): string {
  return `holder:${String(item?.wallet ?? '').trim()}`;
}

function getFeedVersion(items: FeedItem[]): string {
  return items.map((item) => [
    item?.rank ?? '', item?.wallet ?? '', item?.rawAmount ?? '', item?.uiAmount ?? '',
    item?.state ?? '', item?.lastUpdatedMs ?? '', item?.lastSellAllTime ?? '', item?.snapshotTimestamp ?? '',
  ].join(':')).join('|') || 'no-holders';
}

interface ScrollSnapshot {
  scrollLeft: number;
  anchorKey: string | null;
  anchorOffset: number;
}

function captureScrollState(rail: HTMLDivElement | null): ScrollSnapshot | null {
  if (!rail) return null;
  const scrollLeft = rail.scrollLeft;
  const railRect = rail.getBoundingClientRect();
  const children = Array.from(rail.children) as HTMLElement[];
  if (!children.length) return { scrollLeft, anchorKey: null, anchorOffset: 0 };
  const anchor = children.find((child) => child.getBoundingClientRect().right > railRect.left + 2);
  return {
    scrollLeft,
    anchorKey: anchor?.dataset.feedKey || null,
    anchorOffset: anchor ? anchor.getBoundingClientRect().left - railRect.left : 0,
  };
}

function restoreScrollState(rail: HTMLDivElement, snapshot: ScrollSnapshot | null): void {
  if (!snapshot) return;
  const previousBehavior = rail.style.scrollBehavior;
  rail.style.scrollBehavior = 'auto';
  if (snapshot.anchorKey) {
    const anchor = Array.from(rail.children).find((child) => (child as HTMLElement).dataset.feedKey === snapshot.anchorKey) as HTMLElement | undefined;
    if (anchor) {
      const delta = anchor.getBoundingClientRect().left - rail.getBoundingClientRect().left - snapshot.anchorOffset;
      const targetScroll = Math.max(0, snapshot.scrollLeft + delta);
      rail.scrollLeft = targetScroll;
      requestAnimationFrame(() => { rail.scrollLeft = targetScroll; });
      requestAnimationFrame(() => { rail.style.scrollBehavior = previousBehavior; });
      return;
    }
  }
  const maxScroll = Math.max(0, rail.scrollWidth - rail.clientWidth);
  rail.scrollLeft = Math.min(snapshot.scrollLeft, maxScroll);
  requestAnimationFrame(() => { rail.style.scrollBehavior = previousBehavior; });
}

function HolderCard({ item, entering }: { item: FeedItem; entering: boolean }) {
  const wallet = String(item?.wallet ?? '');
  return (
    <article className={`live-card${entering ? ' is-entering' : ' is-visible'}`} data-feed-key={getHolderKey(item)} data-wallet={wallet}>
      <div className="holder-card-top">
        <div className="live-card-rank" data-role="rank">{item?.rank ?? '--'}</div>
        <button className="holder-live-card-vote" type="button">+VOTE</button>
      </div>
      <div className="live-card-wallet" data-role="wallet">{shortWallet(wallet)}</div>
      <div className="live-card-line" data-role="hold">{formatAmount(item?.uiAmount)}</div>
      <div className="live-card-footer">
        <button className="live-card-action like" type="button" aria-label="Like"><img src="/css/images/like-logo.svg" alt="Likes" /></button>
        <button className="live-card-action view" type="button" aria-label="View wallet"><img src="/css/images/view-logo.svg" alt="Views" /></button>
      </div>
    </article>
  );
}

export function LiveFeedPanel() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [status, setStatus] = useState<FeedStatus>('loading');
  const [enteringKeys, setEnteringKeys] = useState<Set<string>>(new Set());
  const railRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<FeedItem[]>([]);
  const requestControllerRef = useRef<AbortController | null>(null);
  const requestSequenceRef = useRef(0);
  const scheduleSequenceRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);
  const pendingScrollRef = useRef<ScrollSnapshot | null>(null);
  const pendingEnteringRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(false);
  const initialReadinessTrackedRef = useRef(false);
  const lastVersionRef = useRef<string | null>(null);

  const loadFeed = useCallback(async () => {
    const currentRequest = ++requestSequenceRef.current;
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;

    if (itemsRef.current.length === 0) setStatus('loading');

    try {
      const response = await fetch(`${API_PATHS.liveFeedHolders}?limit=${FEED_LIMIT}`, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as { items?: FeedItem[] };
      if (currentRequest !== requestSequenceRef.current) return;
      if (!data || !Array.isArray(data.items)) throw new Error('Invalid Top 100 holders payload.');

      const nextItems = data.items.slice(0, FEED_LIMIT);
      const version = getFeedVersion(nextItems);
      if (itemsRef.current.length > 0 && lastVersionRef.current === version) return;

      const previousKeys = new Set(itemsRef.current.map(getHolderKey));
      pendingEnteringRef.current = new Set(nextItems.map(getHolderKey).filter((key) => !previousKeys.has(key)));
      pendingScrollRef.current = captureScrollState(railRef.current);
      itemsRef.current = nextItems;
      setItems(nextItems);
      setEnteringKeys(pendingEnteringRef.current);
      setStatus(nextItems.length ? 'ready' : 'empty');
      lastVersionRef.current = version;
    } catch (error) {
      if ((error as { name?: string })?.name === 'AbortError' || currentRequest !== requestSequenceRef.current) return;
      console.error('[LiveFeed:holders]', error);
      if (itemsRef.current.length === 0) setStatus('error');
    } finally {
      if (currentRequest === requestSequenceRef.current) requestControllerRef.current = null;
    }
  }, []);

  const runAndSchedule = useCallback(() => {
    const scheduleSequence = ++scheduleSequenceRef.current;
    if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
    const request = loadFeed();
    if (!initialReadinessTrackedRef.current) {
      initialReadinessTrackedRef.current = true;
      void trackPageReadiness(request, 'live-feed-holders-initial-data');
    }
    void request.finally(() => {
      if (!mountedRef.current || scheduleSequence !== scheduleSequenceRef.current) return;
      timerRef.current = window.setTimeout(runAndSchedule, REFRESH_INTERVAL);
    });
  }, [loadFeed]);

  useEffect(() => {
    mountedRef.current = true;
    runAndSchedule();
    return () => {
      mountedRef.current = false;
      requestSequenceRef.current += 1;
      scheduleSequenceRef.current += 1;
      requestControllerRef.current?.abort();
      if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
    };
  }, [runAndSchedule]);

  useLayoutEffect(() => {
    if (pendingScrollRef.current && railRef.current) {
      restoreScrollState(railRef.current, pendingScrollRef.current);
      pendingScrollRef.current = null;
    }

    const newKeys = pendingEnteringRef.current;
    if (newKeys.size > 0 && railRef.current) {
      const cards = Array.from(railRef.current.children) as HTMLElement[];
      cards.forEach((card, index) => {
        if (!newKeys.has(card.dataset.feedKey || '')) return;
        const delay = Math.min(index * CARD_STAGGER_STEP, MAX_CARD_STAGGER);
        card.style.transitionDelay = `${delay}ms`;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            card.classList.remove('is-entering');
            card.classList.add('is-visible');
            window.setTimeout(() => { card.style.transitionDelay = ''; }, 350 + delay);
          });
        });
      });
      pendingEnteringRef.current = new Set();
    }
  }, [items]);

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target.closest('.live-feed-rail-scroll') as HTMLDivElement | null : null;
    if (!target) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!Number.isFinite(delta) || delta === 0) return;
    const current = target.scrollLeft;
    const max = target.scrollWidth - target.clientWidth;
    if (max <= 0 || (current <= 0 && delta < 0) || (current >= max && delta > 0)) return;
    event.preventDefault();
    target.scrollLeft = Math.max(0, Math.min(max, current + delta));
  };

  const panelMessage = status === 'error'
    ? 'Live data temporarily unavailable.'
    : status === 'empty'
      ? 'No holder data available.'
      : null;

  return (
    <section className="feature-section live-feed-feature" aria-labelledby="live-feed-heading">
      <header className="feature-section-heading">
        <div><span className="eyebrow">On-chain activity</span><h2 id="live-feed-heading">Live Feed</h2></div>
        <span className="feature-refresh-state" aria-live="polite">{status === 'loading' && items.length === 0 ? 'Connecting…' : 'Refreshes every 5s'}</span>
      </header>
      <div className="live-bar">
        <div className="live-bar-menu" role="tablist" aria-label="Live feed type">
          <span id="top-holders" className="live-menu-btn is-active" role="tab" aria-selected="true">Top 100 Holders</span>
          <button id="last-24h-winners" className="live-menu-btn" type="button" disabled aria-disabled="true">Last 100 Wins</button>
          <button id="top-winners" className="live-menu-btn" type="button" disabled aria-disabled="true">Top 100 Wins</button>
        </div>
        <div id="live-feed-panel" ref={railRef} className="live-feed-panel" data-feed-type="holders" role="tabpanel" aria-labelledby="top-holders" onWheel={handleWheel}>
          <div className="live-feed-rail-scroll">
            {panelMessage ? <div className={`live-feed-state${status === 'error' ? ' live-feed-error' : ''}`}>{panelMessage}</div> : null}
            {!panelMessage ? items.map((item) => {
              const key = getHolderKey(item);
              return <HolderCard key={key} item={item} entering={enteringKeys.has(key)} />;
            }) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
