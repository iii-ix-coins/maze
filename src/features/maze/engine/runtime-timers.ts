/** One-shot visual callbacks whose lifetime belongs to the active Engine mount. */
const pendingTimers = new Set<number>();

export function scheduleEngineTimeout(callback: () => void, delayMs: number): number {
  const timer = window.setTimeout(() => {
    pendingTimers.delete(timer);
    callback();
  }, delayMs);
  pendingTimers.add(timer);
  return timer;
}

export function clearEngineTimeouts(): void {
  for (const timer of pendingTimers) window.clearTimeout(timer);
  pendingTimers.clear();
}
