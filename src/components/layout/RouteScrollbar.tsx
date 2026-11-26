import { useEffect, useRef } from 'react';

type RouteScrollbarProps = {
  /** Scoped scrolling element inside the owning frame. */
  contentSelector?: string;
  label?: string;
};

/** Cross-browser scrollbar shared by site routes and the Maze content frame. */
export function RouteScrollbar({
  contentSelector = ':scope > .feature-page-shell',
  label = 'Page content scrollbar',
}: RouteScrollbarProps) {
  const scrollbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scrollbar = scrollbarRef.current;
    const frame = scrollbar?.parentElement;
    if (!scrollbar || !frame) return undefined;

    const track = scrollbar.querySelector<HTMLElement>('.route-scrollbar-track');
    const thumb = scrollbar.querySelector<HTMLElement>('.route-scrollbar-thumb');
    if (!track || !thumb) return undefined;

    let scroller: HTMLElement | null = null;
    let animationFrame = 0;
    let dragging = false;
    let dragStartY = 0;
    let dragStartScrollTop = 0;

    const getMaxScroll = () => scroller
      ? Math.max(0, scroller.scrollHeight - scroller.clientHeight)
      : 0;

    const setVisible = (visible: boolean) => {
      scrollbar.dataset.visible = String(visible);
      scrollbar.setAttribute('aria-hidden', String(!visible));
      scrollbar.tabIndex = visible ? 0 : -1;
    };

    setVisible(false);

    const update = () => {
      animationFrame = 0;
      if (!scroller) {
        setVisible(false);
        return;
      }

      const maxScroll = getMaxScroll();
      const trackHeight = track.getBoundingClientRect().height;
      if (maxScroll <= 1 || trackHeight <= 0) {
        setVisible(false);
        scrollbar.setAttribute('aria-valuemax', '0');
        scrollbar.setAttribute('aria-valuenow', '0');
        return;
      }

      const visibleRatio = scroller.clientHeight / scroller.scrollHeight;
      const thumbHeight = Math.min(
        trackHeight,
        Math.max(22, Math.round(trackHeight * visibleRatio)),
      );
      const thumbTravel = Math.max(0, trackHeight - thumbHeight);
      const scrollRatio = Math.min(1, Math.max(0, scroller.scrollTop / maxScroll));
      const thumbOffset = thumbTravel * scrollRatio;

      scrollbar.style.setProperty('--route-scroll-thumb-height', `${thumbHeight}px`);
      scrollbar.style.setProperty('--route-scroll-thumb-offset', `${thumbOffset}px`);
      scrollbar.setAttribute('aria-valuemax', String(Math.round(maxScroll)));
      scrollbar.setAttribute('aria-valuenow', String(Math.round(scroller.scrollTop)));
      scrollbar.setAttribute('aria-valuetext', `${Math.round(scrollRatio * 100)}%`);
      setVisible(true);
    };

    const scheduleUpdate = () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(update);
    };

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(scheduleUpdate)
      : null;
    const contentObserver = new MutationObserver(() => {
      observeContentSizes();
      scheduleUpdate();
    });
    const frameObserver = new MutationObserver(bindScroller);

    function observeContentSizes() {
      if (!scroller || !resizeObserver) return;
      resizeObserver.disconnect();
      resizeObserver.observe(scroller);
      Array.from(scroller.children).forEach((child) => resizeObserver.observe(child));
    }

    function bindScroller() {
      const nextScroller = frame.querySelector<HTMLElement>(contentSelector);
      if (nextScroller === scroller) return;

      if (scroller) {
        scroller.removeEventListener('scroll', scheduleUpdate);
        scroller.removeEventListener('load', scheduleUpdate, true);
        contentObserver.disconnect();
      }
      resizeObserver?.disconnect();
      scroller = nextScroller;

      if (!scroller) {
        setVisible(false);
        return;
      }

      if (!scroller.id) scroller.id = 'site-route-scroll-content';
      scrollbar.setAttribute('aria-controls', scroller.id);
      scroller.addEventListener('scroll', scheduleUpdate, { passive: true });
      scroller.addEventListener('load', scheduleUpdate, true);
      contentObserver.observe(scroller, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      observeContentSizes();
      scheduleUpdate();
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!scroller || getMaxScroll() <= 1) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;

      event.preventDefault();
      const trackRect = track.getBoundingClientRect();
      const trackHeight = track.clientHeight;
      const thumbHeight = thumb.clientHeight;
      const maxScroll = getMaxScroll();
      const target = event.target;
      const startedOnThumb = target instanceof Node && thumb.contains(target);

      if (startedOnThumb) {
        dragStartY = event.clientY;
        dragStartScrollTop = scroller.scrollTop;
      } else {
        const thumbTravel = Math.max(1, trackHeight - thumbHeight);
        const desiredOffset = event.clientY - trackRect.top - thumbHeight / 2;
        const ratio = Math.min(1, Math.max(0, desiredOffset / thumbTravel));
        scroller.scrollTop = ratio * maxScroll;
        dragStartY = event.clientY;
        dragStartScrollTop = scroller.scrollTop;
      }

      dragging = true;
      scrollbar.classList.add('is-dragging');
      try {
        scrollbar.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture may be unavailable in older embedded browsers.
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!dragging || !scroller) return;
      const thumbTravel = Math.max(1, track.clientHeight - thumb.clientHeight);
      const maxScroll = getMaxScroll();
      const scrollPerPixel = maxScroll / thumbTravel;
      scroller.scrollTop = dragStartScrollTop + (event.clientY - dragStartY) * scrollPerPixel;
    };

    const stopDragging = (event?: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      scrollbar.classList.remove('is-dragging');
      if (event && scrollbar.hasPointerCapture(event.pointerId)) {
        scrollbar.releasePointerCapture(event.pointerId);
      }
    };

    const onLostPointerCapture = () => stopDragging();

    const onWheel = (event: WheelEvent) => {
      if (!scroller || getMaxScroll() <= 1) return;
      event.preventDefault();
      scroller.scrollTop += event.deltaY;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!scroller) return;
      const pageStep = Math.max(40, Math.round(scroller.clientHeight * 0.85));
      let nextScrollTop: number | undefined;

      switch (event.key) {
        case 'ArrowDown':
          nextScrollTop = scroller.scrollTop + 40;
          break;
        case 'ArrowUp':
          nextScrollTop = scroller.scrollTop - 40;
          break;
        case 'PageDown':
          nextScrollTop = scroller.scrollTop + pageStep;
          break;
        case 'PageUp':
          nextScrollTop = scroller.scrollTop - pageStep;
          break;
        case 'Home':
          nextScrollTop = 0;
          break;
        case 'End':
          nextScrollTop = getMaxScroll();
          break;
        default:
          return;
      }

      event.preventDefault();
      scroller.scrollTop = nextScrollTop;
    };

    scrollbar.addEventListener('pointerdown', onPointerDown);
    scrollbar.addEventListener('wheel', onWheel, { passive: false });
    scrollbar.addEventListener('pointermove', onPointerMove);
    scrollbar.addEventListener('pointerup', stopDragging);
    scrollbar.addEventListener('pointercancel', stopDragging);
    scrollbar.addEventListener('lostpointercapture', onLostPointerCapture);
    scrollbar.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', scheduleUpdate);
    frameObserver.observe(frame, { childList: true });
    bindScroller();

    return () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      if (scroller) {
        scroller.removeEventListener('scroll', scheduleUpdate);
        scroller.removeEventListener('load', scheduleUpdate, true);
      }
      resizeObserver?.disconnect();
      contentObserver.disconnect();
      frameObserver.disconnect();
      scrollbar.removeEventListener('pointerdown', onPointerDown);
      scrollbar.removeEventListener('wheel', onWheel);
      scrollbar.removeEventListener('pointermove', onPointerMove);
      scrollbar.removeEventListener('pointerup', stopDragging);
      scrollbar.removeEventListener('pointercancel', stopDragging);
      scrollbar.removeEventListener('lostpointercapture', onLostPointerCapture);
      scrollbar.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', scheduleUpdate);
    };
  }, [contentSelector]);

  return (
    <div
      ref={scrollbarRef}
      className="route-scrollbar"
      role="scrollbar"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={0}
      aria-valuenow={0}
      tabIndex={-1}
      data-visible="false"
      aria-hidden="true"
    >
      <span className="route-scrollbar-track" aria-hidden="true">
        <span className="route-scrollbar-thumb" />
      </span>
    </div>
  );
}
