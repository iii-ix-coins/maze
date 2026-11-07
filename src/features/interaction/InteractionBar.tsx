import { useCallback, useEffect, useRef, useState } from 'react';

interface InteractionStats {
  views: number;
  likes: number;
  shares: number;
}

const EMPTY_STATS: InteractionStats = { views: 0, likes: 0, shares: 0 };

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value));
}

function useAnimatedCount(target: number, duration = 50): number {
  const [displayed, setDisplayed] = useState(target);
  const currentRef = useRef(target);

  useEffect(() => {
    const from = currentRef.current;
    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const next = from + (target - from) * eased;
      currentRef.current = next;
      setDisplayed(next);
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [target, duration]);

  return displayed;
}

function TipsButton() {
  const timeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => () => {
    if (timeoutRef.current !== undefined) window.clearTimeout(timeoutRef.current);
  }, []);

  const openTips = () => {
    const target = document.querySelector<HTMLElement>('.slider-card');
    if (!target) {
      document.dispatchEvent(new CustomEvent('maze:tips-open'));
      return;
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.remove('tips-target-highlight');
    // Force a reflow so repeated clicks can replay the highlight animation.
    void target.offsetWidth;
    target.classList.add('tips-target-highlight');
    if (timeoutRef.current !== undefined) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      target.classList.remove('tips-target-highlight');
    }, 1400);
  };

  return (
    <button
      id="btn-tips"
      className="interact-btn ttips"
      type="button"
      title="Tips"
      aria-label="Go to Tips and formulas"
      onClick={openTips}
    >
      <img src="/css/images/tips-logo.svg" alt="" aria-hidden="true" />
      <span>Tips</span>
    </button>
  );
}

export function InteractionBar() {
  const [stats, setStats] = useState<InteractionStats>(EMPTY_STATS);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('https://hollld.fun');
  const [likeAnimating, setLikeAnimating] = useState(false);
  const [copying, setCopying] = useState(false);
  const inFlightRef = useRef(false);
  const copyTimerRef = useRef<number | undefined>(undefined);
  const likeTimerRef = useRef<number | undefined>(undefined);

  const updateStats = useCallback((payload: Partial<InteractionStats> | null | undefined) => {
    if (!payload || typeof payload !== 'object') return;
    setStats((current) => ({
      views: typeof payload.views === 'number' ? payload.views : current.views,
      likes: typeof payload.likes === 'number' ? payload.likes : current.likes,
      shares: typeof payload.shares === 'number' ? payload.shares : current.shares,
    }));
  }, []);

  const fetchStats = useCallback(async (recordView = false) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      const response = await fetch(recordView ? '/api/stats/view' : '/api/stats', {
        method: recordView ? 'POST' : 'GET',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`Stats request failed: ${response.status}`);
      updateStats(await response.json() as InteractionStats);
    } catch (error) {
      console.error('[Interactions] Stats request failed:', error);
    } finally {
      inFlightRef.current = false;
    }
  }, [updateStats]);

  useEffect(() => {
    void fetchStats(true);
    const poll = window.setInterval(() => void fetchStats(false), 3000);
    return () => window.clearInterval(poll);
  }, [fetchStats]);

  useEffect(() => () => {
    if (copyTimerRef.current !== undefined) window.clearTimeout(copyTimerRef.current);
    if (likeTimerRef.current !== undefined) window.clearTimeout(likeTimerRef.current);
  }, []);

  const handleLike = async () => {
    setLikeAnimating(false);
    // Reflow is intentionally local to replay the original 100ms heart animation.
    requestAnimationFrame(() => setLikeAnimating(true));
    if (likeTimerRef.current !== undefined) window.clearTimeout(likeTimerRef.current);
    likeTimerRef.current = window.setTimeout(() => setLikeAnimating(false), 180);

    try {
      const response = await fetch('/api/stats/like', { method: 'POST' });
      if (!response.ok) throw new Error(`Like request failed: ${response.status}`);
      updateStats(await response.json() as InteractionStats);
    } catch (error) {
      console.error('[Interactions] Like request failed:', error);
    }
  };

  const openShare = () => {
    setShareUrl(window.location.href);
    setShareOpen(true);
  };

  const copyShareUrl = async () => {
    const value = shareUrl.trim();
    if (!value || copying) return;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '0';
        document.body.append(textarea);
        textarea.focus();
        textarea.select();
        const copied = document.execCommand('copy');
        textarea.remove();
        if (!copied) throw new Error('Copy command failed.');
      }

      setCopying(true);
      // Preserve the original interaction contract: counting the share is
      // fire-and-forget and the copied modal closes after 1.5s regardless of
      // API latency. The request still uses the same endpoint and payload.
      void fetch('/api/stats/share', { method: 'POST' })
        .then(async (response) => {
          if (!response.ok) throw new Error(`Share request failed: ${response.status}`);
          updateStats(await response.json() as InteractionStats);
        })
        .catch((error) => {
          console.error('[Interactions] Failed to update share stats:', error);
        });

      if (copyTimerRef.current !== undefined) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => {
        setCopying(false);
        setShareOpen(false);
      }, 1500);
    } catch (error) {
      console.error('[Interactions] Failed to copy share URL:', error);
    }
  };

  const views = useAnimatedCount(stats.views);
  const likes = useAnimatedCount(stats.likes);
  const shares = useAnimatedCount(stats.shares);

  return (
    <>
      <div id="site-interaction-bar" className="site-interaction-bar-host">
        <div className="interaction-bar">
          <div className="interaction-bar__tips-slot"><TipsButton /></div>
          <div className="interact-btn view-only tview" title="Views">
            <img src="/css/images/view-logo.svg" alt="Views" />
            <span id="view-count" title="Views">{formatCount(views)}</span>
          </div>
          <button
            id="btn-like"
            className={`interact-btn tlike${likeAnimating ? ' beat-anim' : ''}`}
            type="button"
            title="Likes"
            onClick={() => void handleLike()}
          >
            <img src="/css/images/like-logo.svg" alt="Likes" />
            <span id="like-count" title="Likes">{formatCount(likes)}</span>
          </button>
          <button id="btn-share" className="interact-btn tshare" type="button" title="Share" onClick={openShare}>
            <img src="/css/images/share-logo.svg" alt="Share" />
            <span id="share-count" title="Shares">{formatCount(shares)}</span>
          </button>
        </div>
      </div>

      <div id="site-share-modal" className="site-share-modal-host">
        <div id="share-modal" className={`modal-overlay${shareOpen ? ' active' : ''}`} aria-hidden={!shareOpen}>
          <div className="modal-box" role="dialog" aria-modal="true" aria-labelledby="share-modal-title">
            <img src="/css/images/hollld-logo.svg" alt="Hollld Logo" className="popup-img" />
            <h3 id="share-modal-title">hollld.fun</h3>
            <p>Share it with your friends!</p>
            <div className="copy-box">
              <input
                type="text"
                id="share-url"
                readOnly
                value={shareUrl}
                aria-label="Share URL"
              />
              <button
                id="btn-copy"
                className={`share-copy-btn${copying ? ' is-copied' : ''}`}
                type="button"
                title={copying ? 'Copied' : 'Copy Share Link'}
                aria-label={copying ? 'Copied' : 'Copy Share Link'}
                disabled={copying}
                onClick={() => void copyShareUrl()}
              >
                <img src={copying ? '/css/images/copied-logo.svg' : '/css/images/copy-logo.svg'} alt={copying ? 'Copied' : 'Copy'} />
              </button>
            </div>
            <button id="btn-close-modal" className="close-modal" type="button" onClick={() => setShareOpen(false)}>Close</button>
          </div>
        </div>
      </div>
    </>
  );
}
