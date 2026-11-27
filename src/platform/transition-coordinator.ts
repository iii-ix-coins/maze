import { normalizePath } from '../app/routes';

const PENDING_ENTRY_KEY = 'maze:document-transition:v1';
const PENDING_ENTRY_MAX_AGE_MS = 15_000;
const DOCUMENT_EXIT_DURATION_MS = 130;
const DOCUMENT_ENTER_DURATION_MS = 220;
const NAVIGATION_RECOVERY_DELAY_MS = 1_800;

/** Minimal surface of the native API, kept structural for browser/TS compatibility. */
type NativeViewTransition = { finished?: Promise<unknown> };
type TransitionDocument = Document & {
  startViewTransition?: (update: () => void) => NativeViewTransition;
};

type PendingDocumentEntry = {
  version: 1;
  destination: string;
  createdAt: number;
};

export type DocumentNavigationOptions = {
  replace?: boolean;
};

let nativeTransitionInFlight = false;
let waapiContentTransitionInFlight = false;
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

/**
 * Single owner for every same-document View Transition in the application.
 * If another transition is already running, callers apply their state update
 * immediately rather than starting competing browser snapshots.
 */
function startNativeViewTransition(update: () => void, mode: 'content' | 'maze-menu' | 'theme'): boolean {
  const transitionDocument = document as TransitionDocument;
  const startTransition = transitionDocument.startViewTransition;
  if (!startTransition || prefersReducedMotion() || nativeTransitionInFlight || waapiContentTransitionInFlight) return false;

  const root = document.documentElement;
  nativeTransitionInFlight = true;
  if (mode === 'theme') {
    root.dataset.uiThemeTransition = 'true';
  } else {
    root.dataset.uiViewTransition = 'scoped';
    if (mode === 'content') root.dataset.uiContentTransition = 'true';
    else root.dataset.uiMazeMenuTransition = 'true';
  }

  let updateRan = false;
  let transition: NativeViewTransition;
  try {
    transition = startTransition.call(transitionDocument, () => {
      updateRan = true;
      update();
    });
  } catch {
    finishNativeViewTransition(root, mode);
    return updateRan;
  }

  const finish = () => finishNativeViewTransition(root, mode);
  if (transition.finished) void transition.finished.then(finish, finish);
  else window.requestAnimationFrame(finish);
  return true;
}

function finishNativeViewTransition(root: HTMLElement, mode: 'content' | 'maze-menu' | 'theme'): void {
  if (mode === 'theme') {
    delete root.dataset.uiThemeTransition;
  } else {
    delete root.dataset.uiViewTransition;
    if (mode === 'content') delete root.dataset.uiContentTransition;
    else delete root.dataset.uiMazeMenuTransition;
  }
  nativeTransitionInFlight = false;
}

/** Animate one named content surface while keeping all three persistent frames still. */
export function startContentViewTransition(update: () => void): boolean {
  if (supportsSameDocumentViewTransitions()) {
    const started = startNativeViewTransition(update, 'content');
    if (started || nativeTransitionInFlight || waapiContentTransitionInFlight || prefersReducedMotion()) return started;
  }
  return startSameDocumentWaapiTransition(update);
}

/** Only the active Maze menu panel moves for Create/Rooms/Live tab changes. */
export function startMazeMenuViewTransition(update: () => void): boolean {
  return startNativeViewTransition(update, 'maze-menu');
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

/** WAAPI fallback for same-document page/auth/engine swaps on older browsers. */
function startSameDocumentWaapiTransition(update: () => void): boolean {
  if (prefersReducedMotion() || nativeTransitionInFlight || waapiContentTransitionInFlight) return false;
  const outgoing = getDocumentTransitionSurface();
  if (!outgoing || typeof outgoing.animate !== 'function') return false;

  waapiContentTransitionInFlight = true;
  document.documentElement.dataset.uiContentTransitionFallback = 'true';
  void (async () => {
    try {
      // Animation failure must never block the state/navigation update.
      try {
        await animateSurface(outgoing, [
          { opacity: 1, transform: 'translate3d(0, 0, 0)' },
          { opacity: 0, transform: 'translate3d(0, -5px, 0)' },
        ], DOCUMENT_EXIT_DURATION_MS);
      } catch (animationError) {
        console.warn('[transition] outgoing WAAPI animation was skipped:', animationError);
      }

      try {
        update();
      } catch (error) {
        console.error('[transition] same-document update failed after the outgoing animation', error);
        return;
      }

      await waitForAnimationFrames();
      const incoming = getDocumentTransitionSurface();
      if (!incoming || !incoming.isConnected || typeof incoming.animate !== 'function') return;
      try {
        await animateSurface(incoming, [
          { opacity: 0, transform: 'translate3d(0, 7px, 0)' },
          { opacity: 1, transform: 'translate3d(0, 0, 0)' },
        ], DOCUMENT_ENTER_DURATION_MS);
      } catch (animationError) {
        console.warn('[transition] incoming WAAPI animation was skipped:', animationError);
      }
    } finally {
      delete document.documentElement.dataset.uiContentTransitionFallback;
      waapiContentTransitionInFlight = false;
    }
  })();
  return true;
}

/** Theme changes alone may animate the document root; all page transitions stay scoped. */
export function startThemeViewTransition(update: () => void): boolean {
  return startNativeViewTransition(update, 'theme');
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

/** Wait for the WAAPI entry phase, including the case where PageLoading has not consumed its marker yet. */
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

/** Returns only the active content; never returns the outer frame, header or dock. */
export function getDocumentTransitionSurface(): HTMLElement | null {
  // MazeFrame is intentionally parked in the DOM after its first visit so the
  // Engine's cached node references remain valid. Always select the visible
  // surface, rather than treating the existence of #mazeApp as the active route.
  const candidates = [
    '#mazeApp > .access-gate',
    '#mazeApp > .maze-authenticated-boot',
    '#mazeApp > #createGame.cg.show',
    '#mazeApp > .game-container',
    '.route-page > .feature-page-shell',
  ];

  for (const selector of candidates) {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element || element.closest('[hidden]') || element.getClientRects().length === 0) continue;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
    return element;
  }
  return null;
}

function animateSurface(surface: HTMLElement, frames: Keyframe[], duration: number): Promise<void> {
  if (prefersReducedMotion() || typeof surface.animate !== 'function') return Promise.resolve();
  const animation = surface.animate(frames, {
    duration,
    easing: 'cubic-bezier(.2, .75, .25, 1)',
    fill: 'both',
  });
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

/**
 * Entry half of the WAAPI document-boundary fallback. It runs only after the
 * destination Gate, authenticated boot surface or real page is ready.
 */
export async function animatePendingDocumentEntry(): Promise<void> {
  try {
    if (prefersReducedMotion()) return;
    const surface = await waitForDocumentTransitionSurface();
    if (!surface || typeof surface.animate !== 'function') return;

    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
    });
    if (!surface.isConnected) return;

    document.documentElement.dataset.uiDocumentEntering = 'true';
    await animateSurface(surface, [
      { opacity: 0, transform: 'translate3d(0, 7px, 0)' },
      { opacity: 1, transform: 'translate3d(0, 0, 0)' },
    ], DOCUMENT_ENTER_DURATION_MS);
  } catch (animationError) {
    // A presentation failure must not leave the entry-session barrier unresolved.
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

/**
 * Full-document navigation is reserved for destinations outside the shared SPA.
 * It remains a WAAPI fallback because a browser-level transition can snapshot
 * the initial loader before the destination document has mounted its content.
 */
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
  const sourceHref = window.location.href;
  const root = document.documentElement;

  const surface = prefersReducedMotion() ? null : getDocumentTransitionSurface();
  let animation: Animation | null = null;
  if (surface && typeof surface.animate === 'function') {
    root.dataset.uiDocumentExiting = 'true';
    try {
      animation = surface.animate([
        { opacity: 1, transform: 'translate3d(0, 0, 0)' },
        { opacity: 0, transform: 'translate3d(0, -5px, 0)' },
      ], {
        duration: DOCUMENT_EXIT_DURATION_MS,
        easing: 'cubic-bezier(.4, 0, 1, 1)',
        fill: 'both',
      });
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
