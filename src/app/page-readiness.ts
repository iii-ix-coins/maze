/**
 * Page readiness coordination for the shared React application.
 *
 * This module deliberately does not own fetching, routing, rendering, or the
 * Maze engine. Features register only their first, display-critical request;
 * recurring polling and sockets must never block page visibility.
 */

type PendingTask = { cycle: number; label: string };

let activeCycle = 0;
let nextTaskId = 0;
const pendingTasks = new Map<number, PendingTask>();

const nextFrame = () => new Promise<void>((resolve) => {
  window.requestAnimationFrame(() => resolve());
});

const delay = (ms: number) => new Promise<void>((resolve) => {
  window.setTimeout(resolve, ms);
});

/** Start a new route's readiness scope before React mounts its page. */
export function beginPageReadinessCycle(): number {
  activeCycle += 1;
  pendingTasks.clear();
  return activeCycle;
}

/** Register a one-time critical task without changing its result or error. */
export function trackPageReadiness<T>(promise: Promise<T>, label: string): Promise<T> {
  const cycle = activeCycle;
  const id = ++nextTaskId;
  pendingTasks.set(id, { cycle, label });

  void Promise.resolve(promise).then(
    () => {
      if (cycle === activeCycle) pendingTasks.delete(id);
    },
    () => {
      if (cycle === activeCycle) pendingTasks.delete(id);
    },
  );

  return promise;
}

function isVisibleImage(image: HTMLImageElement): boolean {
  if (image.loading === 'lazy') return false;
  const rect = image.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
}

async function waitForVisualAssets(timeoutMs: number): Promise<void> {
  const visualTasks: Promise<unknown>[] = [];

  if ('fonts' in document && document.fonts?.ready) {
    visualTasks.push(document.fonts.ready.catch(() => undefined));
  }

  const root = document.querySelector<HTMLElement>('#root');
  const images = root
    ? Array.from(root.querySelectorAll('img')).filter(isVisibleImage)
    : [];
  for (const image of images) {
    if (typeof image.decode === 'function') {
      visualTasks.push(image.decode().catch(() => undefined));
    } else if (!image.complete) {
      visualTasks.push(new Promise<void>((resolve) => {
        image.addEventListener('load', () => resolve(), { once: true });
        image.addEventListener('error', () => resolve(), { once: true });
      }));
    }
  }

  if (!visualTasks.length) return;
  await Promise.race([Promise.all(visualTasks).then(() => undefined), delay(timeoutMs)]);
}

/**
 * Wait until registered first-load tasks and visible visual assets settle.
 * A bounded timeout guarantees that an unavailable API cannot trap the user
 * behind the page loader forever. Failed requests count as settled; the page
 * itself remains responsible for rendering its existing error state.
 */
export async function waitForPageReadiness(timeoutMs = 8_000): Promise<void> {
  const deadline = performance.now() + Math.max(0, timeoutMs);

  // Let React commit the incoming route and run its effects (which register tasks).
  await nextFrame();
  await nextFrame();
  // Visual assets are awaited in parallel with critical data tasks.
  const visualAssetsReady = waitForVisualAssets(timeoutMs);

  let stableEmptyFrames = 0;
  while (performance.now() < deadline) {
    const tasks = Array.from(pendingTasks.entries())
      .filter(([, task]) => task.cycle === activeCycle)
      .map(([id]) => id);

    if (tasks.length === 0) {
      stableEmptyFrames += 1;
      if (stableEmptyFrames >= 2) break;
      await nextFrame();
      continue;
    }

    stableEmptyFrames = 0;
    await Promise.race([
      Promise.all(tasks.map((id) => new Promise<void>((resolve) => {
        const check = () => {
          if (!pendingTasks.has(id) || pendingTasks.get(id)?.cycle !== activeCycle) resolve();
          else window.setTimeout(check, 25);
        };
        check();
      }))),
      delay(Math.min(50, Math.max(0, deadline - performance.now()))),
    ]);
  }

  await visualAssetsReady;
  await nextFrame();
}
