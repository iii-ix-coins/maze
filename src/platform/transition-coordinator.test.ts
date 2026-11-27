import { afterEach, describe, expect, it, vi } from 'vitest';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeHarness(options: { native?: boolean; reducedMotion?: boolean } = {}) {
  const nativeTransitions: Array<{
    finished: Deferred<void>;
    update: () => void;
    skipTransition: ReturnType<typeof vi.fn>;
  }> = [];
  const animations: Array<{
    finished: Deferred<void>;
    frames: Keyframe[];
    timing: KeyframeAnimationOptions;
    cancel: ReturnType<typeof vi.fn>;
  }> = [];

  const surface = {
    isConnected: true,
    getClientRects: () => [{ width: 100, height: 100 }],
    closest: () => null,
    animate: vi.fn((frames: Keyframe[], timing: KeyframeAnimationOptions) => {
      const finished = deferred<void>();
      const settled = { value: false };
      const cancel = vi.fn(() => {
        if (settled.value) return;
        settled.value = true;
        finished.reject(new Error('Animation cancelled'));
      });
      animations.push({ finished, frames, timing, cancel });
      return { finished: finished.promise, cancel } as unknown as Animation;
    }),
  } as unknown as HTMLElement;

  const documentElement = { dataset: {} as Record<string, string> };
  const documentStub = {
    documentElement,
    body: { classList: { contains: () => false } },
    querySelector: vi.fn(() => surface),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    startViewTransition: options.native === false ? undefined : vi.fn((update: () => void) => {
      const finished = deferred<void>();
      const skipTransition = vi.fn(() => finished.resolve());
      nativeTransitions.push({ finished, update, skipTransition });
      update();
      return { finished: finished.promise, updateCallbackDone: Promise.resolve(), skipTransition };
    }),
  } as unknown as Document & {
    startViewTransition?: (update: () => void) => unknown;
  };

  const windowStub = {
    matchMedia: vi.fn(() => ({ matches: options.reducedMotion === true })),
    getComputedStyle: vi.fn(() => ({
      display: 'block',
      visibility: 'visible',
      opacity: '1',
      getPropertyValue: (name: string) => ({
        '--motion-route-duration': '220ms',
        '--motion-route-easing': 'cubic-bezier(.22, 1, .36, 1)',
        '--motion-route-distance': '7px',
        '--motion-route-exit-distance': '5px',
      } as Record<string, string>)[name] ?? '',
    })),
    requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 0) as unknown as number,
    setTimeout: ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => setTimeout(handler, timeout, ...args)) as typeof window.setTimeout,
    clearTimeout: ((handle: number) => clearTimeout(handle)) as typeof window.clearTimeout,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    location: { href: 'https://example.test/' },
    sessionStorage: { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() },
  } as unknown as Window;

  vi.stubGlobal('document', documentStub);
  vi.stubGlobal('window', windowStub);

  return { nativeTransitions, animations, surface, documentElement };
}

async function flushTasks(): Promise<void> {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

async function loadCoordinator() {
  vi.resetModules();
  return import('./transition-coordinator');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('centralized content transition scheduler', () => {
  it('queues concurrent content changes and commits each accepted update exactly once', async () => {
    const harness = makeHarness();
    const coordinator = await loadCoordinator();
    const first = vi.fn();
    const second = vi.fn();

    expect(coordinator.startContentViewTransition(first)).toBe(true);
    expect(coordinator.startContentViewTransition(second)).toBe(true);
    expect(harness.nativeTransitions).toHaveLength(1);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();

    harness.nativeTransitions[0]!.finished.resolve();
    await flushTasks();

    expect(harness.nativeTransitions).toHaveLength(2);
    expect(second).toHaveBeenCalledTimes(1);
    harness.nativeTransitions[1]!.finished.resolve();
    await flushTasks();
  });

  it('resolves queue-idle waiters only after the final accepted transition settles', async () => {
    const harness = makeHarness();
    const coordinator = await loadCoordinator();
    const first = vi.fn();
    const second = vi.fn();
    let idle = false;

    coordinator.startContentViewTransition(first);
    coordinator.startContentViewTransition(second);
    void coordinator.waitForTransitionQueueIdle().then(() => { idle = true; });

    harness.nativeTransitions[0]!.finished.resolve();
    await flushTasks();
    expect(idle).toBe(false);
    expect(second).toHaveBeenCalledTimes(1);

    harness.nativeTransitions[1]!.finished.resolve();
    await flushTasks();
    expect(idle).toBe(true);
  });

  it('serializes theme and content transitions through the same browser lock', async () => {
    const harness = makeHarness();
    const coordinator = await loadCoordinator();
    const content = vi.fn();
    const obsoleteTheme = vi.fn();
    const latestTheme = vi.fn();

    coordinator.startContentViewTransition(content);
    coordinator.startThemeViewTransition(obsoleteTheme);
    coordinator.startThemeViewTransition(latestTheme);

    expect(harness.nativeTransitions).toHaveLength(1);
    harness.nativeTransitions[0]!.finished.resolve();
    await flushTasks();

    expect(obsoleteTheme).not.toHaveBeenCalled();
    expect(latestTheme).toHaveBeenCalledTimes(1);
    expect(harness.nativeTransitions).toHaveLength(2);
    harness.nativeTransitions[1]!.finished.resolve();
    await flushTasks();
  });

  it('keeps the queue moving when a consumer update throws', async () => {
    const harness = makeHarness();
    const coordinator = await loadCoordinator();
    const nextUpdate = vi.fn();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    coordinator.startContentViewTransition(() => { throw new Error('simulated consumer failure'); });
    coordinator.startContentViewTransition(nextUpdate);
    harness.nativeTransitions[0]!.finished.resolve();
    await flushTasks();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(nextUpdate).toHaveBeenCalledTimes(1);
    expect(harness.nativeTransitions).toHaveLength(2);
    harness.nativeTransitions[1]!.finished.resolve();
    await flushTasks();
    errorSpy.mockRestore();
  });

  it('coalesces queued navigation to the latest destination', async () => {
    const harness = makeHarness();
    const coordinator = await loadCoordinator();
    const active = vi.fn();
    const obsoleteDestination = vi.fn();
    const latestDestination = vi.fn();

    coordinator.startContentViewTransition(active);
    coordinator.startContentViewTransition(obsoleteDestination, { key: 'navigation' });
    coordinator.startContentViewTransition(latestDestination, { key: 'navigation' });

    harness.nativeTransitions[0]!.finished.resolve();
    await flushTasks();

    expect(obsoleteDestination).not.toHaveBeenCalled();
    expect(latestDestination).toHaveBeenCalledTimes(1);
    harness.nativeTransitions[1]!.finished.resolve();
    await flushTasks();
  });

  it('runs urgent identity changes before already queued presentation changes', async () => {
    const harness = makeHarness();
    const coordinator = await loadCoordinator();
    const active = vi.fn();
    const navigation = vi.fn();
    const logout = vi.fn();

    coordinator.startContentViewTransition(active);
    coordinator.startContentViewTransition(navigation, { key: 'navigation' });
    coordinator.startContentViewTransition(logout, { key: 'identity', priority: 'urgent' });

    expect(harness.nativeTransitions[0]!.skipTransition).toHaveBeenCalledTimes(1);
    harness.nativeTransitions[0]!.finished.resolve();
    await flushTasks();

    expect(logout).toHaveBeenCalledTimes(1);
    expect(navigation).not.toHaveBeenCalled();
    harness.nativeTransitions[1]!.finished.resolve();
    await flushTasks();

    expect(navigation).toHaveBeenCalledTimes(1);
    harness.nativeTransitions[2]!.finished.resolve();
    await flushTasks();
  });

  it('splits the canonical route duration across sequential WAAPI phases', async () => {
    const harness = makeHarness({ native: false });
    const coordinator = await loadCoordinator();
    const update = vi.fn();

    coordinator.startContentViewTransition(update);
    expect(harness.animations).toHaveLength(1);
    expect(harness.animations[0]!.timing.duration).toBe(110);

    harness.animations[0]!.finished.resolve();
    await flushTasks();
    expect(update).toHaveBeenCalledTimes(1);
    expect(harness.animations).toHaveLength(2);
    expect(harness.animations[1]!.timing.duration).toBe(110);
    expect(Number(harness.animations[0]!.timing.duration) + Number(harness.animations[1]!.timing.duration)).toBe(220);

    harness.animations[1]!.finished.resolve();
    await flushTasks();
  });

  it('commits immediately without creating a transition for reduced-motion users', async () => {
    const harness = makeHarness({ reducedMotion: true });
    const coordinator = await loadCoordinator();
    const update = vi.fn();

    expect(coordinator.startContentViewTransition(update)).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    expect(harness.nativeTransitions).toHaveLength(0);
    expect(harness.animations).toHaveLength(0);
  });

  it('allows an urgent identity request to preempt the visual phase of WAAPI motion without dropping its update', async () => {
    const harness = makeHarness({ native: false });
    const coordinator = await loadCoordinator();
    const firstUpdate = vi.fn();
    const logoutUpdate = vi.fn();

    coordinator.startContentViewTransition(firstUpdate);
    coordinator.startContentViewTransition(logoutUpdate, { key: 'identity', priority: 'urgent' });
    expect(harness.animations[0]!.cancel).toHaveBeenCalledTimes(1);
    await flushTasks();

    expect(firstUpdate).toHaveBeenCalledTimes(1);
    expect(logoutUpdate).not.toHaveBeenCalled();
    expect(harness.animations).toHaveLength(2);

    harness.animations[1]!.finished.resolve();
    await flushTasks();
    expect(logoutUpdate).toHaveBeenCalledTimes(1);
    expect(harness.animations).toHaveLength(3);
    harness.animations[2]!.finished.resolve();
    await flushTasks();
  });
});
