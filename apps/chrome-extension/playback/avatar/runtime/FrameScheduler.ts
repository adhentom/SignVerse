export interface FrameScheduler {
  readonly kind: 'animation-frame' | 'timer-fallback';
  request(callback: FrameRequestCallback): number;
  cancel(handle: number): void;
  now(): number;
}

export interface FrameSchedulerEnvironment {
  requestAnimationFrame?: typeof requestAnimationFrame;
  cancelAnimationFrame?: typeof cancelAnimationFrame;
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(handle: number): void;
  now(): number;
}

export function frameSchedulerEnvironment(): FrameSchedulerEnvironment {
  return {
    requestAnimationFrame: typeof globalThis.requestAnimationFrame === 'function'
      ? globalThis.requestAnimationFrame.bind(globalThis)
      : undefined,
    cancelAnimationFrame: typeof globalThis.cancelAnimationFrame === 'function'
      ? globalThis.cancelAnimationFrame.bind(globalThis)
      : undefined,
    setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs) as unknown as number,
    clearTimeout: (handle) => globalThis.clearTimeout(handle),
    now: () => typeof performance === 'undefined' ? Date.now() : performance.now(),
  };
}

export function createFrameScheduler(
  environment: FrameSchedulerEnvironment = frameSchedulerEnvironment(),
): FrameScheduler {
  if (environment.requestAnimationFrame && environment.cancelAnimationFrame) {
    return {
      kind: 'animation-frame',
      request: (callback) => environment.requestAnimationFrame!(callback),
      cancel: (handle) => environment.cancelAnimationFrame!(handle),
      now: environment.now,
    };
  }
  return {
    kind: 'timer-fallback',
    request: (callback) => environment.setTimeout(() => callback(environment.now()), 1000 / 60),
    cancel: (handle) => environment.clearTimeout(handle),
    now: environment.now,
  };
}
