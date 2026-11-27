import { normalizePath } from '../app/routes';

const PENDING_ENTRY_KEY = 'maze:document-transition:v1';
const PENDING_ENTRY_MAX_AGE_MS = 15_000;
const NAVIGATION_RECOVERY_DELAY_MS = 1_800;
const NATIVE_TRANSITION_FAILSAFE_EXTRA_MS = 1_200;
const NATIVE_TRANSITION_FINAL_FAILSAFE_MS = 500;
const DEFAULT_ROUTE_DURATION_MS = 220;
const DEFAULT_ROUTE_EASING = 'cubic-bezier(.22, 1, .36, 1)';
const DEFAULT_ROUTE_DISTANCE = 7;

type NativeViewTransition = {
  finished?: Promise<unknown>;
  updateCallbackDone?: Promise<unknown>;
  skipTransition?: () => void;
};
type TransitionDocument = Document & {
  startViewTransition?: (update: () => void) => NativeViewTransition;
};
type TransitionMode = 'content' | 'theme';
type TransitionPriority = 'normal' | 'urgent';

export type ViewTransitionOptions = {
  /** Replace an older request with the same key while it is still queued. */
  key?: string;
  /** Urgent identity changes are placed before queued presentation changes. */
  priority?: TransitionPriority;
};

export type DocumentNavigationOptions = {
  replace?: boolean;
};

type TransitionRequest = {
  id: number;
  mode: TransitionMode;
  update: () => void;
  key?: string;
  priority: TransitionPriority;
};

type ActiveTransition = {
  request: TransitionRequest;
  settled: boolean;
  updateApplied: boolean;
  preemptRequested: boolean;
  phase: 'native' | 'exit' | 'enter' | 'update' | null;
  nativeTransition: NativeViewTransition | null;
  animation: Animation | null;
  failsafe: number | null;
  finalFailsafe: number | null;
};

type PendingDocumentEntry = {
  version: 1;
  destination: string;
  createdAt: number;
};

const pendingTransitions: TransitionRequest[] = [];
const transitionIdleWaiters = new Set<() => void>();
let activeTransition: ActiveTransition | null = null;
let nextTransitionId = 0;
let documentNavigationInFlight = false;
let pendingRecoveryTimer: number | null = null;
let activeDocumentExitAnimation: Animation | null = null;
let documentEntryPromise: Promise<void> | null = null;
let settleDocumentEntryPromise: (() => void) | null = null;

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function supportsSameDocumentViewTransitions(): boolean {
  return typeof document !== 'undefined'
    && typeof (document as TransitionDocument).startViewTransition === 'function';
}

// Set before the first React commit so the CSS entrance fallback does not race
// the browser's named View Transition snapshots on supporting browsers.
if (supportsSameDocumentViewTransitions()) {
  document.documentElement.dataset.uiViewTransitionSupport = 'true';
}

function parseCssTime(value: string, fallback: number): number {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)\s*(ms|s)$/i);
  if (!match) return fallback;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount < 0) return fallback;
  return match[2].toLowerCase() === 's' ? amount * 1_000 : amount;
}

/** CSS is the single source of truth for route transition timing and geometry. */
function getRouteMotionTokens(): { duration: number; easing: string; distance: string; exitDistance: string } {
  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof window.getComputedStyle !== 'function') {
    return {
      duration: DEFAULT_ROUTE_DURATION_MS,
      easing: DEFAULT_ROUTE_EASING,
      distance: `${DEFAULT_ROUTE_DISTANCE}px`,
      exitDistance: '5px',
    };
  }

  const styles = window.getComputedStyle(document.documentElement);
  const duration = parseCssTime(styles.getPropertyValue('--motion-route-duration'), DEFAULT_ROUTE_DURATION_MS);
  const easing = styles.getPropertyValue('--motion-route-easing').trim() || DEFAULT_ROUTE_EASING;
  const distance = styles.getPropertyValue('--motion-route-distance').trim() || `${DEFAULT_ROUTE_DISTANCE}px`;
  const exitDistance = styles.getPropertyValue('--motion-route-exit-distance').trim() || '5px';
  return { duration, easing, distance, exitDistance };
}

function invokeUpdate(request: TransitionRequest): void {
  try {
    request.update();
  } catch (error) {
    // Never let a consumer exception strand the global transition queue.
    console.error(`[transition] ${request.mode} update failed:`, error);
  }
}

function clearActiveMarkers(active: ActiveTransition): void {
  const root = document.documentElement;
  if (active.request.mode === 'theme') {
    delete root.dataset.uiThemeTransition;
  } else {
    delete root.dataset.uiViewTransition;
    delete root.dataset.uiContentTransition;
    delete root.dataset.uiContentTransitionFallback;
  }
}

function applyActiveUpdate(active: ActiveTransition): void {
  if (active.updateApplied) return;
  active.updateApplied = true;
  active.phase = 'update';
  invokeUpdate(active.request);
}

function resolveTransitionIdleWaiters(): void {
  if (activeTransition || pendingTransitions.length > 0) return;
  for (const resolve of transitionIdleWaiters) resolve();
  transitionIdleWaiters.clear();
}

function finishActiveTransition(active: ActiveTransition): void {
  if (active.settled || activeTransition !== active) return;
  // State correctness outranks motion: even a failed animation must commit its update.
  applyActiveUpdate(active);
  active.settled = true;
  if (active.failsafe !== null) window.clearTimeout(active.failsafe);
  if (active.finalFailsafe !== null) window.clearTimeout(active.finalFailsafe);
  active.failsafe = null;
  active.finalFailsafe = null;
  active.animation = null;
  clearActiveMarkers(active);
  activeTransition = null;
  // Let the browser finish the current style/React commit before starting the next snapshot.
  void Promise.resolve().then(() => {
    runNextTransition();
    resolveTransitionIdleWaiters();
  });
}

function runNativeTransition(active: ActiveTransition): void {
  const transitionDocument = document as TransitionDocument;
  const startTransition = transitionDocument.startViewTransition;
  if (!startTransition) {
    if (active.request.mode === 'content') runWaapiTransition(active);
    else finishActiveTransition(active);
    return;
  }

  const root = document.documentElement;
  active.phase = 'native';
  if (active.request.mode === 'theme') {
    root.dataset.uiThemeTransition = 'true';
  } else {
    root.dataset.uiViewTransition = 'scoped';
    root.dataset.uiContentTransition = 'true';
  }

  const updateOnce = () => {
    if (active.settled) return;
    applyActiveUpdate(active);
  };

  try {
    const transition = startTransition.call(transitionDocument, updateOnce);
    active.nativeTransition = transition;

    const finishNative = () => {
      // A broken/partial implementation must never discard the state update.
      updateOnce();
      finishActiveTransition(active);
    };
    if (transition.finished) {
      void transition.finished.then(finishNative, finishNative);
    } else if (transition.updateCallbackDone) {
      void transition.updateCallbackDone.then(
        () => window.requestAnimationFrame(finishNative),
        finishNative,
      );
    } else {
      window.requestAnimationFrame(finishNative);
    }

    // If a browser extension or interrupted snapshot leaves `finished` pending,
    // ask the native API to skip its visual phase; the React update still runs.
    const { duration } = getRouteMotionTokens();
    active.failsafe = window.setTimeout(() => {
      if (active.settled) return;
      try {
        transition.skipTransition?.();
      } catch {
        // The final failsafe below still releases the queue.
      }
      active.finalFailsafe = window.setTimeout(() => {
        updateOnce();
        finishActiveTransition(active);
      }, NATIVE_TRANSITION_FINAL_FAILSAFE_MS);
    }, duration + NATIVE_TRANSITION_FAILSAFE_EXTRA_MS);
  } catch (error) {
    console.warn('[transition] Native View Transition could not start; using the supported fallback.', error);
    clearActiveMarkers(active);
    active.nativeTransition = null;
    if (active.updateApplied) {
      finishActiveTransition(active);
    } else if (active.request.mode === 'content') {
      runWaapiTransition(active);
    } else {
      finishActiveTransition(active);
    }
  }
}

function waitForAnimationFrames(count = 2): Promise<void> {
  return new Promise((resolve) => {
    const next = (remaining: number) => {
      if (remaining <= 0) resolve();
      else window.requestAnimationFrame(() => next(remaining - 1));
    };
    next(count);
  });
}

function playSurfaceAnimation(
  active: ActiveTransition,
  surface: HTMLElement,
  frames: Keyframe[],
): Promise<void> {
  if (prefersReducedMotion() || typeof surface.animate !== 'function') return Promise.resolve();
  const { duration, easing } = getRouteMotionTokens();
  // Native View Transition old/new snapshots run concurrently for the full
  // route duration. WAAPI must split that same total budget across its
  // sequential outgoing and incoming phases.
  const phaseDuration = Math.max(1, duration / 2);
  const animation = surface.animate(frames, { duration: phaseDuration, easing, fill: 'both' });
  active.animation = animation;
  return animation.finished.then(
    () => undefined,
    () => undefined,
  ).finally(() => {
    if (active.animation === animation) active.animation = null;
    try { animation.cancel(); } catch { /* an already-finished animation is harmless */ }
  });
}

/** WAAPI fallback used only when the browser has no usable native View Transition API. */
function runWaapiTransition(active: ActiveTransition): void {
  const outgoing = getDocumentTransitionSurface();
  if (!outgoing || typeof outgoing.animate !== 'function' || active.request.mode === 'theme') {
    finishActiveTransition(active);
    return;
  }

  document.documentElement.dataset.uiContentTransitionFallback = 'true';
  void (async () => {
    try {
      const { distance, exitDistance } = getRouteMotionTokens();
      active.phase = 'exit';
      await playSurfaceAnimation(active, outgoing, [
        { opacity: 1, transform: 'translate3d(0, 0, 0)' },
        { opacity: 0, transform: `translate3d(0, -${exitDistance}, 0)` },
      ]);

      // Once a request becomes active, its update is committed exactly once.
      // An urgent request may preempt visuals, never the active state update.
      // Replaceable pending intents may be coalesced before activation.
      applyActiveUpdate(active);
      if (active.preemptRequested || active.settled) return;

      await waitForAnimationFrames(1);
      if (active.preemptRequested || active.settled) return;

      const incoming = getDocumentTransitionSurface();
      if (!incoming || !incoming.isConnected || typeof incoming.animate !== 'function') return;
      active.phase = 'enter';
      await playSurfaceAnimation(active, incoming, [
        { opacity: 0, transform: `translate3d(0, ${distance}, 0)` },
        { opacity: 1, transform: 'translate3d(0, 0, 0)' },
      ]);
    } catch (animationError) {
      console.warn('[transition] WAAPI content transition was skipped:', animationError);
      applyActiveUpdate(active);
    } finally {
      finishActiveTransition(active);
    }
  })();
}

function requestActivePreemption(priority: TransitionPriority): void {
  const active = activeTransition;
  if (!active || priority !== 'urgent' || active.request.priority === 'urgent') return;
  active.preemptRequested = true;

  if (active.nativeTransition?.skipTransition) {
    try { active.nativeTransition.skipTransition(); } catch { /* finish/failsafe handles recovery */ }
    return;
  }

  // Cancelling WAAPI settles Animation.finished; the active request still commits
  // its update, but skips its incoming visual phase before urgent work begins.
  try { active.animation?.cancel(); } catch { /* the animation may have just settled */ }
}

function insertPendingTransition(request: TransitionRequest): void {
  if (request.key) {
    const existingIndex = pendingTransitions.findIndex((pending) => pending.key === request.key);
    if (existingIndex >= 0) pendingTransitions.splice(existingIndex, 1);
  }
  pendingTransitions.push(request);
  pendingTransitions.sort((left, right) => {
    const priority = (right.priority === 'urgent' ? 1 : 0) - (left.priority === 'urgent' ? 1 : 0);
    return priority || left.id - right.id;
  });
}

function runNextTransition(): void {
  if (activeTransition || pendingTransitions.length === 0 || typeof window === 'undefined' || typeof document === 'undefined') return;
  const request = pendingTransitions.shift()!;
  const active: ActiveTransition = {
    request,
    settled: false,
    updateApplied: false,
    preemptRequested: false,
    phase: null,
    nativeTransition: null,
    animation: null,
    failsafe: null,
    finalFailsafe: null,
  };
  activeTransition = active;

  if (prefersReducedMotion()) {
    finishActiveTransition(active);
    return;
  }

  if (supportsSameDocumentViewTransitions()) {
    runNativeTransition(active);
    return;
  }

  if (request.mode === 'theme') {
    // Theme changes remain correct in older browsers; they simply do not animate.
    finishActiveTransition(active);
    return;
  }

  runWaapiTransition(active);
}

function enqueueTransition(
  mode: TransitionMode,
  update: () => void,
  options: ViewTransitionOptions = {},
): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;

  const request: TransitionRequest = {
    id: ++nextTransitionId,
    mode,
    update,
    key: options.key,
    priority: options.priority ?? 'normal',
  };

  // Avoid starting an animation for reduced-motion users when the scheduler is idle.
  if (!activeTransition && pendingTransitions.length === 0 && prefersReducedMotion()) {
    invokeUpdate(request);
    return true;
  }

  insertPendingTransition(request);
  requestActivePreemption(request.priority);
  runNextTransition();
  return true;
}

/**
 * All same-document content changes use this serialized scheduler. A request is
 * never silently rejected because another transition is active; keyed pending
 * requests coalesce to the latest destination while urgent identity changes win.
 */
export function startContentViewTransition(
  update: () => void,
  options: ViewTransitionOptions = {},
): boolean {
  return enqueueTransition('content', update, options);
}

/** Theme updates share the same native transition lock and are coalesced by key. */
export function startThemeViewTransition(update: () => void): boolean {
  return enqueueTransition('theme', update, { key: 'theme' });
}

/** Cancel a not-yet-started keyed request (used when a pending route is superseded). */
export function cancelPendingContentViewTransition(key: string): void {
  for (let index = pendingTransitions.length - 1; index >= 0; index -= 1) {
    if (pendingTransitions[index]?.key === key) pendingTransitions.splice(index, 1);
  }
  resolveTransitionIdleWaiters();
}

/** Resolve only after all content and theme work already accepted by the coordinator has settled. */
export function waitForTransitionQueueIdle(): Promise<void> {
  if (!activeTransition && pendingTransitions.length === 0) return Promise.resolve();
  return new Promise((resolve) => transitionIdleWaiters.add(resolve));
}

function destinationKey(url: URL): string {
  // Maze may normalize/remove invite parameters during boot; path is the stable identity.
  return normalizePath(url.pathname);
}

function writePendingEntry(url: URL): void {
  const intent: PendingDocumentEntry = {
    version: 1,
    destination: destinationKey(url),
    createdAt: Date.now(),
  };
  try {
    window.sessionStorage.setItem(PENDING_ENTRY_KEY, JSON.stringify(intent));
  } catch {
    // Storage may be disabled. The outgoing transition still works; entry becomes immediate.
  }
}

function clearPendingEntry(): void {
  try { window.sessionStorage.removeItem(PENDING_ENTRY_KEY); } catch { /* optional storage */ }
}

function isPendingEntryForCurrentDocument(): boolean {
  try {
    const raw = window.sessionStorage.getItem(PENDING_ENTRY_KEY);
    if (!raw) return false;
    const intent = JSON.parse(raw) as PendingDocumentEntry;
    const age = Date.now() - intent.createdAt;
    const sameDestination = intent.destination === destinationKey(new URL(window.location.href));
    const valid = intent.version === 1
      && sameDestination
      && ((age >= 0 && age <= PENDING_ENTRY_MAX_AGE_MS) || Boolean(documentEntryPromise));
    if (valid) beginDocumentEntrySession();
    return valid;
  } catch {
    return false;
  }
}

function beginDocumentEntrySession(): void {
  if (documentEntryPromise) return;
  documentEntryPromise = new Promise<void>((resolve) => {
    settleDocumentEntryPromise = resolve;
  });
}

function finishDocumentEntrySession(): void {
  settleDocumentEntryPromise?.();
  settleDocumentEntryPromise = null;
  documentEntryPromise = null;
  delete document.documentElement.dataset.uiDocumentEntering;
}

/** Wait for the WAAPI entry phase, including when PageLoading has not consumed its marker yet. */
export function waitForDocumentEntryToFinish(): Promise<void> {
  if (!documentEntryPromise && isPendingEntryForCurrentDocument()) beginDocumentEntrySession();
  return documentEntryPromise ?? Promise.resolve();
}

/** Consume once, and only on the exact same-tab destination that initiated navigation. */
export function consumePendingDocumentEntry(): boolean {
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(PENDING_ENTRY_KEY);
    window.sessionStorage.removeItem(PENDING_ENTRY_KEY);
  } catch {
    return false;
  }
  if (!raw) return false;

  try {
    const intent = JSON.parse(raw) as PendingDocumentEntry;
    const age = Date.now() - intent.createdAt;
    return intent.version === 1
      && intent.destination === destinationKey(new URL(window.location.href))
      && age >= 0
      && age <= PENDING_ENTRY_MAX_AGE_MS;
  } catch {
    return false;
  }
}

/** Returns only the active content; never the outer frame, header or dock. */
export function getDocumentTransitionSurface(): HTMLElement | null {
  const element = document.querySelector<HTMLElement>(
    '.route-page > .feature-page-shell > .route-view:not([hidden])',
  );
  if (!element || element.closest('[hidden]') || element.getClientRects().length === 0) return null;
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return null;
  return element;
}

function animateSurface(surface: HTMLElement, frames: Keyframe[]): Promise<void> {
  if (prefersReducedMotion() || typeof surface.animate !== 'function') return Promise.resolve();
  const { duration, easing } = getRouteMotionTokens();
  const animation = surface.animate(frames, { duration, easing, fill: 'both' });
  return animation.finished.then(
    () => { animation.cancel(); },
    () => { animation.cancel(); },
  );
}

function waitForDocumentTransitionSurface(timeoutMs = 2_500): Promise<HTMLElement | null> {
  const current = getDocumentTransitionSurface();
  if (current) return Promise.resolve(current);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (surface: HTMLElement | null) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      window.clearTimeout(timeout);
      resolve(surface);
    };
    const observer = new MutationObserver(() => {
      const surface = getDocumentTransitionSurface();
      if (surface) finish(surface);
    });
    const timeout = window.setTimeout(() => finish(null), timeoutMs);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'hidden', 'style'],
    });
    const surface = getDocumentTransitionSurface();
    if (surface) finish(surface);
  });
}

/** Entry half of the WAAPI document-boundary fallback. */
export async function animatePendingDocumentEntry(): Promise<void> {
  try {
    if (prefersReducedMotion()) return;
    const surface = await waitForDocumentTransitionSurface();
    if (!surface || typeof surface.animate !== 'function') return;

    await waitForAnimationFrames();
    if (!surface.isConnected) return;

    document.documentElement.dataset.uiDocumentEntering = 'true';
    const { distance } = getRouteMotionTokens();
    await animateSurface(surface, [
      { opacity: 0, transform: `translate3d(0, ${distance}, 0)` },
      { opacity: 1, transform: 'translate3d(0, 0, 0)' },
    ]);
  } catch (animationError) {
    console.warn('[transition] document entrance animation was skipped:', animationError);
  } finally {
    finishDocumentEntrySession();
  }
}

function clearNavigationRecovery(): void {
  if (pendingRecoveryTimer !== null) {
    window.clearTimeout(pendingRecoveryTimer);
    pendingRecoveryTimer = null;
  }
}

function restoreAfterCancelledNavigation(animation?: Animation | null): void {
  clearPendingEntry();
  animation?.cancel();
  activeDocumentExitAnimation = null;
  delete document.documentElement.dataset.uiDocumentExiting;
  documentNavigationInFlight = false;
}

// A page restored from BFCache must not retain an old navigation lock or faded surface.
if (typeof window !== 'undefined') {
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    clearNavigationRecovery();
    restoreAfterCancelledNavigation(activeDocumentExitAnimation);
  });
}

/** Full-document navigation is reserved for destinations outside the shared SPA. */
export async function navigateDocument(
  url: URL,
  options: DocumentNavigationOptions = {},
): Promise<void> {
  if (documentNavigationInFlight) return;
  if (url.origin !== window.location.origin) {
    window.location.assign(url.href);
    return;
  }

  documentNavigationInFlight = true;
  await waitForTransitionQueueIdle();
  const sourceHref = window.location.href;
  const root = document.documentElement;

  const surface = prefersReducedMotion() ? null : getDocumentTransitionSurface();
  let animation: Animation | null = null;
  if (surface && typeof surface.animate === 'function') {
    root.dataset.uiDocumentExiting = 'true';
    try {
      const { exitDistance, duration, easing } = getRouteMotionTokens();
      animation = surface.animate([
        { opacity: 1, transform: 'translate3d(0, 0, 0)' },
        { opacity: 0, transform: `translate3d(0, -${exitDistance}, 0)` },
      ], { duration, easing, fill: 'both' });
      activeDocumentExitAnimation = animation;
      // A cancelled animation must not cancel navigation; it only removes the visual enhancement.
      try { await animation.finished; } catch { /* continue with the document navigation */ }
      writePendingEntry(url);
    } catch {
      delete root.dataset.uiDocumentExiting;
      animation = null;
      activeDocumentExitAnimation = null;
    }
  }

  let didLeaveDocument = false;
  const onPageHide = () => {
    didLeaveDocument = true;
    clearNavigationRecovery();
  };
  window.addEventListener('pagehide', onPageHide, { once: true });

  try {
    if (options.replace) window.location.replace(url.href);
    else window.location.assign(url.href);
  } catch {
    window.removeEventListener('pagehide', onPageHide);
    restoreAfterCancelledNavigation(animation);
    return;
  }

  // beforeunload may ask the user to confirm an unfinished race. If navigation
  // is cancelled, restore the content and allow another navigation attempt.
  pendingRecoveryTimer = window.setTimeout(() => {
    pendingRecoveryTimer = null;
    if (didLeaveDocument || window.location.href !== sourceHref) return;
    window.removeEventListener('pagehide', onPageHide);
    restoreAfterCancelledNavigation(animation);
  }, NAVIGATION_RECOVERY_DELAY_MS);
}
