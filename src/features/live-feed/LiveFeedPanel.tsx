import { useCallback, useEffect, useLayoutEffect, useRef, useState, type WheelEvent } from 'react';
import { formatAmount } from '../../services/formatters';
import { trackPageReadiness } from '../../app/page-readiness';

export type FeedType = 'buyers' | 'holders';
type FeedItem = Record<string, any>;
type FeedStatus = 'loading' | 'ready' | 'empty' | 'error';

const FEED_LIMIT = 100;
const REFRESH_INTERVAL = 5000;
const FEED_SWITCH_DURATION = 280;
const CARD_STAGGER_STEP = 8;
const MAX_CARD_STAGGER = 80;

function shortWallet(wallet: unknown): string {
  if (typeof wallet !== 'string' || wallet.length < 12) return String(wallet || 'Unknown');
  return `${wallet.slice(0, 5)}....${wallet.slice(-4)}`;
}

function getBuyerKey(item: FeedItem): string {
  const signature = String(item?.signature ?? '').trim();
  if (signature) return `buyer:${signature}`;
  return ['buyer', item?.buyerWallet ?? '', item?.blockTime ?? '', item?.amountBought ?? ''].join(':');
}

function getHolderKey(item: FeedItem): string {
  return `holder:${String(item?.wallet ?? '').trim()}`;
}

function getFeedKey(type: FeedType, item: FeedItem): string {
  return type === 'buyers' ? getBuyerKey(item) : getHolderKey(item);
}

function getFeedVersion(type: FeedType, data: { items?: FeedItem[] }): string {
  const items = Array.isArray(data?.items) ? data.items.slice(0, FEED_LIMIT) : [];
  if (type === 'holders') {
    return items.map((item) => [
      item?.rank ?? '', item?.wallet ?? '', item?.rawAmount ?? '', item?.uiAmount ?? '',
      item?.state ?? '', item?.lastUpdatedMs ?? '', item?.lastSellAllTime ?? '', item?.snapshotTimestamp ?? '',
    ].join(':')).join('|') || 'no-holders';
  }
  return items.map((item) => `${item?.signature ?? ''}:${item?.blockTime ?? ''}`).join('|') || 'no-buyers';
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
  const leftEdge = railRect.left + 2;
  const anchor = children.find((child) => child.getBoundingClientRect().right > leftEdge);
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

function BuyerCard({ item, entering }: { item: FeedItem; entering: boolean }) {
  const wallet = String(item?.buyerWallet ?? '');
  return (
    <article className={`live-card${entering ? ' is-entering' : ' is-visible'}`} data-feed-key={getBuyerKey(item)} data-signature={item?.signature || ''} data-wallet={wallet}>
      <button className="live-card-vote" type="button">+VOTE</button>
      <div className="live-card-wallet" data-role="wallet">{shortWallet(wallet)}</div>
      <div className="live-card-line" data-role="bought">{formatAmount(item?.amountBought)} Hold</div>
      <div className="live-card-footer">
        <button className="live-card-action like" type="button" aria-label="Like"><img src="/css/images/like-logo.svg" alt="Likes" /></button>
        <button className="live-card-action view" type="button" aria-label="View transaction"><img src="/css/images/view-logo.svg" alt="Views" /></button>
      </div>
    </article>
  );
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
  const [activeFeed, setActiveFeed] = useState<FeedType>('buyers');
  const [displayedFeed, setDisplayedFeed] = useState<FeedType | null>(null);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [status, setStatus] = useState<FeedStatus>('loading');
  const [switchingOut, setSwitchingOut] = useState(false);
  const [enteringKeys, setEnteringKeys] = useState<Set<string>>(new Set());
  const panelRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const activeFeedRef = useRef<FeedType>('buyers');
  const displayedFeedRef = useRef<FeedType | null>(null);
  const itemsRef = useRef<FeedItem[]>([]);
  const requestControllerRef = useRef<AbortController | null>(null);
  const requestSequenceRef = useRef(0);
  const scheduleSequenceRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);
  const switchTimerRef = useRef<number | undefined>(undefined);
  const lastVersionRef = useRef<Record<FeedType, string | null>>({ buyers: null, holders: null });
  const pendingScrollRef = useRef<{ snapshot: ScrollSnapshot | null; reset: boolean } | null>(null);
  const pendingEnteringRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(false);
  const initialReadinessTrackedRef = useRef(false);

  const commitItems = useCallback((type: FeedType, nextItems: FeedItem[], resetScroll: boolean) => {
    const previousKeys = new Set(itemsRef.current.map((item) => getFeedKey(displayedFeedRef.current ?? type, item)));
    const nextEntering = new Set(nextItems.map((item) => getFeedKey(type, item)).filter((key) => !previousKeys.has(key)));
    pendingEnteringRef.current = nextEntering;
    pendingScrollRef.current = {
      snapshot: resetScroll ? null : captureScrollState(railRef.current),
      reset: resetScroll,
    };
    itemsRef.current = nextItems;
    displayedFeedRef.current = type;
    setItems(nextItems);
    setDisplayedFeed(type);
    setEnteringKeys(nextEntering);
    setStatus(nextItems.length ? 'ready' : 'empty');
  }, []);

  const loadFeed = useCallback(async (type: FeedType) => {
    const previousFeed = displayedFeedRef.current;
    const isInitialLoad = previousFeed === null;
    const feedChanged = previousFeed !== type;
    const currentRequest = ++requestSequenceRef.current;
    activeFeedRef.current = type;
    setActiveFeed(type);

    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;

    if (isInitialLoad) setStatus('loading');

    try {
      const response = await fetch(`/api/live-feed/${encodeURIComponent(type)}?limit=${FEED_LIMIT}`, {
        method: 'GET', cache: 'no-store', signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as { items?: FeedItem[] };
      if (currentRequest !== requestSequenceRef.current || activeFeedRef.current !== type) return;
      if (!data || !Array.isArray(data.items)) throw new Error('Invalid live feed payload.');

      const nextItems = data.items.slice(0, FEED_LIMIT);
      const version = getFeedVersion(type, { items: nextItems });
      if (!feedChanged && lastVersionRef.current[type] === version) return;

      const render = () => {
        if (currentRequest !== requestSequenceRef.current || activeFeedRef.current !== type) return;
        commitItems(type, nextItems, feedChanged);
        lastVersionRef.current[type] = version;
        if (feedChanged && previousFeed !== null) {
          const rail = railRef.current;
          if (rail) rail.scrollLeft = 0;
          setSwitchingOut(false);
        }
      };

      if (feedChanged && previousFeed !== null) {
        setSwitchingOut(true);
        await new Promise<void>((resolve) => {
          if (switchTimerRef.current !== undefined) window.clearTimeout(switchTimerRef.current);
          switchTimerRef.current = window.setTimeout(() => {
            if (currentRequest === requestSequenceRef.current) render();
            resolve();
          }, FEED_SWITCH_DURATION);
        });
      } else {
        render();
      }
    } catch (error) {
      if ((error as { name?: string })?.name === 'AbortError' || currentRequest !== requestSequenceRef.current) return;
      console.error('[LiveFeed]', error);
      if (feedChanged && previousFeed) {
        activeFeedRef.current = previousFeed;
        setActiveFeed(previousFeed);
        setSwitchingOut(false);
      }
      if (isInitialLoad || itemsRef.current.length === 0) setStatus('error');
    } finally {
      if (currentRequest === requestSequenceRef.current) requestControllerRef.current = null;
    }
  }, [commitItems]);

  const runAndSchedule = useCallback((type: FeedType) => {
    const scheduleSequence = ++scheduleSequenceRef.current;
    if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
    const request = loadFeed(type);
    if (!initialReadinessTrackedRef.current) {
      initialReadinessTrackedRef.current = true;
      void trackPageReadiness(request, 'live-feed-initial-data');
    }
    void request.finally(() => {
      if (!mountedRef.current || scheduleSequence !== scheduleSequenceRef.current) return;
      const current = activeFeedRef.current;
      timerRef.current = window.setTimeout(() => runAndSchedule(current), REFRESH_INTERVAL);
    });
  }, [loadFeed]);

  useEffect(() => {
    mountedRef.current = true;
    runAndSchedule('buyers');
    return () => {
      mountedRef.current = false;
      requestSequenceRef.current += 1;
      scheduleSequenceRef.current += 1;
      requestControllerRef.current?.abort();
      if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
      if (switchTimerRef.current !== undefined) window.clearTimeout(switchTimerRef.current);
    };
  }, [runAndSchedule]);

  useLayoutEffect(() => {
    const pendingScroll = pendingScrollRef.current;
    if (pendingScroll && railRef.current) {
      if (pendingScroll.reset) railRef.current.scrollLeft = 0;
      else restoreScrollState(railRef.current, pendingScroll.snapshot);
      pendingScrollRef.current = null;
    }

    const newKeys = pendingEnteringRef.current;
    if (newKeys.size > 0 && railRef.current) {
      const rail = railRef.current;
      const cards = Array.from(rail.children) as HTMLElement[];
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
  }, [items, displayedFeed]);

  const handleSwitch = (type: FeedType) => {
    if (type === activeFeedRef.current && displayedFeedRef.current === type) return;
    activeFeedRef.current = type;
    setActiveFeed(type);
    runAndSchedule(type);
  };

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

  const activeItems = items;
  const messageFeed = displayedFeed ?? activeFeed;
  const panelMessage = status === 'error'
    ? 'Live data temporarily unavailable.'
    : status === 'empty'
      ? messageFeed === 'buyers' ? 'No purchases available.' : 'No holder data available.'
      : null;

  return (
    <section className="feature-section live-feed-feature" aria-labelledby="live-feed-heading">
      <header className="feature-section-heading">
        <div><span className="eyebrow">On-chain activity</span><h2 id="live-feed-heading">Live Feed</h2></div>
        <span className="feature-refresh-state" aria-live="polite">{status === 'loading' && displayedFeed === null ? 'Connecting…' : 'Refreshes every 5s'}</span>
      </header>
      <div className="live-bar">
        <div className="live-bar-menu" role="tablist" aria-label="Live feed type">
          <button id="last-24h-buyers" className={`live-menu-btn${activeFeed === 'buyers' ? ' is-active' : ''}`} type="button" role="tab" aria-selected={activeFeed === 'buyers'} data-live-feed="buyers" onClick={() => handleSwitch('buyers')}>Last 100 Purchases</button>
          <button id="top-holders" className={`live-menu-btn${activeFeed === 'holders' ? ' is-active' : ''}`} type="button" role="tab" aria-selected={activeFeed === 'holders'} data-live-feed="holders" onClick={() => handleSwitch('holders')}>Top 100 Holders</button>
          <button id="last-24h-winners" className="live-menu-btn" type="button" disabled aria-disabled="true">Last 100 Wins</button>
          <button id="top-winners" className="live-menu-btn" type="button" disabled aria-disabled="true">Top 100 Wins</button>
        </div>
        <div id="live-feed-panel" ref={panelRef} className="live-feed-panel" data-feed-type={displayedFeed ?? undefined} onWheel={handleWheel}>
          <div ref={railRef} className={`live-feed-rail-scroll${switchingOut ? ' is-switching-out' : ''}`}>
            {panelMessage ? <div className={`live-feed-state${status === 'error' ? ' live-feed-error' : ''}`}>{panelMessage}</div> : null}
            {!panelMessage ? activeItems.map((item) => {
              const key = getFeedKey(displayedFeed ?? activeFeed, item);
              const entering = enteringKeys.has(key);
              return displayedFeed === 'holders'
                ? <HolderCard key={key} item={item} entering={entering} />
                : <BuyerCard key={key} item={item} entering={entering} />;
            }) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
