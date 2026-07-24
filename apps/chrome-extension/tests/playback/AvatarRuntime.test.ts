import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  detectBrowserCapabilities,
  estimatedBrowserMemoryUsage,
  type BrowserCapabilityEnvironment,
} from '../../playback/avatar/runtime/BrowserCapabilities';
import {
  createFrameScheduler,
  type FrameSchedulerEnvironment,
} from '../../playback/avatar/runtime/FrameScheduler';
import { RenderingHealthMonitor } from '../../playback/avatar/runtime/RenderingHealthMonitor';
import { RuntimeResourcePolicy } from '../../playback/avatar/runtime/RuntimeResourcePolicy';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('RuntimeResourcePolicy', () => {
  it('switches between immutable standard and reduced-resource policies', () => {
    const policy = new RuntimeResourcePolicy();

    expect(policy.current).toEqual({
      mode: 'standard',
      inactiveFrameIntervalMs: 0,
      secondaryMotionScale: 1,
      genericAssetCacheCapacity: 64,
      preloadConcurrency: 2,
    });
    expect(Object.isFrozen(policy.current)).toBe(true);

    policy.setMode('reduced');

    expect(policy.mode).toBe('reduced');
    expect(policy.current).toEqual({
      mode: 'reduced',
      inactiveFrameIntervalMs: 1000 / 15,
      secondaryMotionScale: 0.4,
      genericAssetCacheCapacity: 16,
      preloadConcurrency: 1,
    });
    expect(Object.isFrozen(policy.current)).toBe(true);
  });

  it('does not leak selection state between policy instances', () => {
    const first = new RuntimeResourcePolicy();
    const second = new RuntimeResourcePolicy();

    first.setMode('reduced');

    expect(first.mode).toBe('reduced');
    expect(second.mode).toBe('standard');
  });
});

describe('browser capability detection', () => {
  const completeEnvironment = {
    userAgent: 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36',
    brave: false,
    animationFrame: true,
    cancelAnimationFrame: true,
    matchMedia: true,
    forcedColors: false,
    reducedMotion: false,
    webGl: true,
    performanceMemory: true,
  } satisfies BrowserCapabilityEnvironment;

  it.each([
    ['Chrome', completeEnvironment.userAgent, false, 'chrome'],
    [
      'Edge',
      'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
      false,
      'edge',
    ],
    ['Brave', completeEnvironment.userAgent, true, 'brave'],
    ['Chromium', 'Mozilla/5.0 Chromium/140.0.0.0 Safari/537.36', false, 'chromium'],
  ] as const)('recognizes supported %s environments', (_name, userAgent, brave, family) => {
    const report = detectBrowserCapabilities({
      ...completeEnvironment,
      userAgent,
      brave,
    });

    expect(report).toMatchObject({
      family,
      supported: true,
      degradedFeatures: [],
    });
    expect(Object.isFrozen(report.degradedFeatures)).toBe(true);
    expect(Object.isFrozen(report)).toBe(true);
  });

  it('reports capability degradation without rejecting an otherwise supported browser', () => {
    const report = detectBrowserCapabilities({
      ...completeEnvironment,
      animationFrame: false,
      cancelAnimationFrame: false,
      matchMedia: false,
      webGl: false,
      performanceMemory: false,
    });

    expect(report).toMatchObject({
      family: 'chrome',
      supported: true,
      degradedFeatures: [
        'animation-frame',
        'media-preferences',
        'webgl-renderers',
        'memory-telemetry',
      ],
    });
  });

  it('marks non-Chromium browsers unsupported while retaining graceful diagnostics', () => {
    const report = detectBrowserCapabilities({
      ...completeEnvironment,
      userAgent: 'Mozilla/5.0 Firefox/141.0',
    });

    expect(report.family).toBe('unknown');
    expect(report.supported).toBe(false);
    expect(report.degradedFeatures).toEqual([]);
  });

  it('uses performance memory when available and otherwise returns a finite fallback', () => {
    vi.stubGlobal('performance', {
      memory: { usedJSHeapSize: 4_096 },
    });
    expect(estimatedBrowserMemoryUsage()).toEqual({
      bytes: 4_096,
      source: 'performance-api',
    });

    vi.stubGlobal('performance', {});
    expect(estimatedBrowserMemoryUsage()).toEqual({
      bytes: 0,
      source: 'unavailable',
    });
  });
});

describe('FrameScheduler', () => {
  it('uses animation frames and cancels the exact requested handle', () => {
    const callback = vi.fn<FrameRequestCallback>();
    const requestAnimationFrame = vi.fn(() => 37);
    const cancelAnimationFrame = vi.fn();
    const environment: FrameSchedulerEnvironment = {
      requestAnimationFrame,
      cancelAnimationFrame,
      setTimeout: vi.fn(() => 0),
      clearTimeout: vi.fn(),
      now: () => 123,
    };
    const scheduler = createFrameScheduler(environment);

    const handle = scheduler.request(callback);
    scheduler.cancel(handle);

    expect(scheduler.kind).toBe('animation-frame');
    expect(scheduler.now()).toBe(123);
    expect(requestAnimationFrame).toHaveBeenCalledWith(callback);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(37);
    expect(environment.setTimeout).not.toHaveBeenCalled();
  });

  it('falls back to a cancellable 60 Hz timer if either RAF primitive is unavailable', () => {
    let timerCallback: (() => void) | undefined;
    let time = 40;
    const callback = vi.fn<FrameRequestCallback>();
    const environment: FrameSchedulerEnvironment = {
      requestAnimationFrame: vi.fn(() => 4),
      cancelAnimationFrame: undefined,
      setTimeout: vi.fn((next) => {
        timerCallback = next;
        return 91;
      }),
      clearTimeout: vi.fn(),
      now: () => time,
    };
    const scheduler = createFrameScheduler(environment);

    const handle = scheduler.request(callback);
    expect(scheduler.kind).toBe('timer-fallback');
    expect(environment.setTimeout).toHaveBeenCalledWith(expect.any(Function), 1000 / 60);

    time = 56.67;
    timerCallback?.();
    expect(callback).toHaveBeenCalledWith(56.67);

    scheduler.cancel(handle);
    expect(environment.clearTimeout).toHaveBeenCalledWith(91);
    expect(environment.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('does not invoke a cancelled fallback callback', () => {
    let timerCallback: (() => void) | undefined;
    let cancelled = false;
    const callback = vi.fn<FrameRequestCallback>();
    const environment: FrameSchedulerEnvironment = {
      setTimeout: vi.fn((next) => {
        timerCallback = () => {
          if (!cancelled) next();
        };
        return 12;
      }),
      clearTimeout: vi.fn(() => {
        cancelled = true;
      }),
      now: () => 100,
    };
    const scheduler = createFrameScheduler(environment);

    const handle = scheduler.request(callback);
    scheduler.cancel(handle);
    timerCallback?.();

    expect(callback).not.toHaveBeenCalled();
  });
});

describe('RenderingHealthMonitor', () => {
  it('reports exact rolling frame metrics, uptime, and recovery counters', () => {
    let time = 100;
    const policy = new RuntimeResourcePolicy();
    policy.setMode('reduced');
    const monitor = new RenderingHealthMonitor({
      capacity: 8,
      now: () => time,
      resourcePolicy: policy,
      schedulerKind: 'timer-fallback',
    });

    monitor.recordFrame(10);
    monitor.recordFrame(20, 1);
    monitor.recordFrame(30);
    monitor.recordFrame(40, 1);
    monitor.recordSkippedFrame();
    monitor.recordSkippedFrame();
    monitor.recordRecoveryAttempt();
    monitor.recordFatalError();
    time = 5_100;
    monitor.stop();

    expect(monitor.snapshot()).toMatchObject({
      averageFps: 40,
      frameTimeDistributionMs: {
        p50: 20,
        p95: 40,
        p99: 40,
        maximum: 40,
      },
      droppedFramePercentage: 100 / 3,
      renderLoopUptimeMs: 5_000,
      intentionallySkippedFrames: 2,
      recoveryAttempts: 1,
      fatalErrorCount: 1,
      resourceMode: 'reduced',
      frameScheduler: 'timer-fallback',
    });
  });

  it('keeps a bounded rolling frame-time window', () => {
    const monitor = new RenderingHealthMonitor({
      capacity: 8,
      now: () => 0,
    });

    for (let frame = 1; frame <= 12; frame += 1) {
      monitor.recordFrame(frame);
    }

    expect(monitor.snapshot()).toMatchObject({
      averageFps: 1000 / 8.5,
      frameTimeDistributionMs: {
        p50: 8,
        p95: 12,
        p99: 12,
        maximum: 12,
      },
    });
  });

  it('returns finite zero metrics before the first rendered frame', () => {
    const monitor = new RenderingHealthMonitor({ now: () => 0 });
    const snapshot = monitor.snapshot();

    expect(snapshot).toMatchObject({
      averageFps: 0,
      droppedFramePercentage: 0,
      frameTimeDistributionMs: {
        p50: 0,
        p95: 0,
        p99: 0,
        maximum: 0,
      },
    });
    expect(JSON.stringify(snapshot)).not.toContain('null');
    expect(Object.values(snapshot.frameTimeDistributionMs).every(Number.isFinite)).toBe(true);
  });

  it('freezes uptime after stop and starts a fresh uptime window on restart', () => {
    let time = 10;
    const monitor = new RenderingHealthMonitor({ now: () => time });
    time = 110;
    monitor.stop();
    expect(monitor.snapshot().renderLoopUptimeMs).toBe(100);

    time = 500;
    expect(monitor.snapshot().renderLoopUptimeMs).toBe(100);
    monitor.start('timer-fallback');
    time = 650;

    expect(monitor.snapshot()).toMatchObject({
      renderLoopUptimeMs: 150,
      frameScheduler: 'timer-fallback',
    });
  });
});
