/**
 * Progressive enhancement for transitions that animate one named UI surface
 * while leaving the persistent site chrome untouched.
 *
 * Browsers without the View Transition API (and users who request reduced
 * motion) fall back to the caller's immediate/CSS transition path.
 */
type ScopedViewTransition = {
  finished: Promise<unknown>;
};

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => ScopedViewTransition;
};

const VIEW_TRANSITION_DATASET_KEY = 'uiViewTransition';
const VIEW_TRANSITION_COUNT_KEY = 'uiViewTransitionCount';

function getTransitionDocument(): ViewTransitionDocument | null {
  if (typeof document === 'undefined') return null;
  return document as ViewTransitionDocument;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function supportsScopedViewTransitions(): boolean {
  return typeof getTransitionDocument()?.startViewTransition === 'function';
}

// Mark support before React mounts so CSS can avoid running its fallback
// entrance animation on browsers that use named View Transition snapshots.
if (supportsScopedViewTransitions()) {
  document.documentElement.dataset.uiViewTransitionSupport = 'true';
}

/**
 * Run a synchronous UI update inside a View Transition, if available.
 * Returns false without running `update` when the caller should use its
 * immediate or CSS fallback path.
 */
export function startScopedViewTransition(update: () => void): boolean {
  const transitionDocument = getTransitionDocument();
  const startTransition = transitionDocument?.startViewTransition;

  if (!transitionDocument || typeof startTransition !== 'function' || prefersReducedMotion()) {
    return false;
  }

  const root = document.documentElement;
  const activeCount = Number(root.dataset[VIEW_TRANSITION_COUNT_KEY] || 0) + 1;
  root.dataset[VIEW_TRANSITION_COUNT_KEY] = String(activeCount);
  root.dataset[VIEW_TRANSITION_DATASET_KEY] = 'scoped';

  let updateRan = false;
  let transition: ScopedViewTransition;
  try {
    transition = startTransition.call(transitionDocument, () => {
      updateRan = true;
      update();
    });
  } catch {
    finishScopedTransition(root);
    if (!updateRan) delete root.dataset.uiViewTransitionSupport;
    return updateRan;
  }

  void transition.finished.then(
    () => finishScopedTransition(root),
    () => finishScopedTransition(root),
  );
  return true;
}

function finishScopedTransition(root: HTMLElement): void {
  const activeCount = Math.max(0, Number(root.dataset[VIEW_TRANSITION_COUNT_KEY] || 0) - 1);
  if (activeCount > 0) {
    root.dataset[VIEW_TRANSITION_COUNT_KEY] = String(activeCount);
    return;
  }

  delete root.dataset[VIEW_TRANSITION_COUNT_KEY];
  delete root.dataset[VIEW_TRANSITION_DATASET_KEY];
}
