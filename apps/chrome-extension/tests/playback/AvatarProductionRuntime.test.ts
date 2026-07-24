import { afterEach, describe, expect, it, vi } from 'vitest';
import { RenderLoop } from '../../playback/avatar/controllers/RenderLoop';
import { SecondaryMotionController } from '../../playback/avatar/controllers/SecondaryMotionController';
import { Avatar2DAdapter } from '../../playback/adapters/Avatar2DAdapter';
import { AvatarAssetManager } from '../../playback/avatar/assets';
import { DEFAULT_AVATAR } from '../../playback/avatarProfiles';
import {
  avatarRuntimeResourcePolicy,
  RenderingHealthMonitor,
  RuntimeResourcePolicy,
  type FrameScheduler,
} from '../../playback/avatar/runtime';
import type { MotionPose } from '../../playback/avatar/motion/types';

class ManualFrameScheduler implements FrameScheduler {
  readonly kind = 'animation-frame' as const;
  private callbacks = new Map<number, FrameRequestCallback>();
  private nextHandle = 1;
  private currentTime = 0;
  readonly cancelled: number[] = [];
  maximumPending = 0;

  request(callback: FrameRequestCallback): number {
    const handle = this.nextHandle;
    this.nextHandle += 1;
    this.callbacks.set(handle, callback);
    this.maximumPending = Math.max(this.maximumPending, this.callbacks.size);
    return handle;
  }

  cancel(handle: number): void {
    this.cancelled.push(handle);
    this.callbacks.delete(handle);
  }

  now(): number {
    return this.currentTime;
  }

  advanceTo(time: number): void {
    this.currentTime = time;
    const next = this.callbacks.entries().next().value as
      | [number, FrameRequestCallback]
      | undefined;
    if (!next) throw new Error('No animation frame is pending.');
    const [handle, callback] = next;
    this.callbacks.delete(handle);
    callback(time);
  }

  get pendingCount(): number {
    return this.callbacks.size;
  }

  takePending(): FrameRequestCallback {
    const next = this.callbacks.entries().next().value as
      | [number, FrameRequestCallback]
      | undefined;
    if (!next) throw new Error('No animation frame is pending.');
    this.callbacks.delete(next[0]);
    return next[1];
  }
}

afterEach(() => {
  avatarRuntimeResourcePolicy.setMode('standard');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('RenderLoop production scheduling', () => {
  it('adaptively skips inactive frames and wakes immediately for active playback', () => {
    const scheduler = new ManualFrameScheduler();
    const policy = new RuntimeResourcePolicy();
    policy.setMode('reduced');
    const render = vi.fn();
    let state = {
      queueDepth: 0,
      blendDurationMs: 0,
      activeAnimation: 'idle',
    };
    const stateSnapshot = vi.fn(() => state);
    const loop = new RenderLoop(render, stateSnapshot, {
      scheduler,
      resourcePolicy: policy,
    });

    loop.start();
    scheduler.advanceTo(16);
    scheduler.advanceTo(32);
    scheduler.advanceTo(50);
    expect(render).not.toHaveBeenCalled();
    expect(loop.diagnostics().health).toMatchObject({
      intentionallySkippedFrames: 3,
      resourceMode: 'reduced',
    });

    scheduler.advanceTo(67);
    expect(render).toHaveBeenCalledOnce();
    expect(render).toHaveBeenLastCalledWith(67, 0.067);

    state = {
      queueDepth: 1,
      blendDurationMs: 180,
      activeAnimation: 'HELLO',
    };
    scheduler.advanceTo(75);

    expect(render).toHaveBeenCalledTimes(2);
    expect(render).toHaveBeenLastCalledWith(75, 0.008);
    expect(loop.diagnostics()).toMatchObject({
      animationQueueDepth: 1,
      blendDurationMs: 180,
      activeAnimation: 'HELLO',
    });
    expect(stateSnapshot).toHaveBeenCalledTimes(5);
    loop.stop();
  });

  it('renders every active frame even in reduced-resource mode', () => {
    const scheduler = new ManualFrameScheduler();
    const policy = new RuntimeResourcePolicy();
    policy.setMode('reduced');
    const render = vi.fn();
    const loop = new RenderLoop(render, () => ({
      queueDepth: 1,
      blendDurationMs: 100,
      activeAnimation: 'ACTIVE',
    }), {
      scheduler,
      resourcePolicy: policy,
    });

    loop.start();
    for (let frame = 1; frame <= 120; frame += 1) {
      scheduler.advanceTo(frame * (1_000 / 60));
    }

    expect(render).toHaveBeenCalledTimes(120);
    expect(loop.diagnostics().health?.intentionallySkippedFrames).toBe(0);
    loop.stop();
  });

  it('recovers from one render failure without creating multiple pending frames', () => {
    const scheduler = new ManualFrameScheduler();
    const render = vi.fn()
      .mockImplementationOnce(() => {
        throw new Error('transient render failure');
      })
      .mockImplementation(() => undefined);
    const onFatalError = vi.fn();
    const loop = new RenderLoop(render, () => ({
      queueDepth: 1,
      blendDurationMs: 0,
      activeAnimation: 'HELLO',
    }), {
      scheduler,
      maxConsecutiveRenderFailures: 1,
      onFatalError,
    });

    loop.start();
    scheduler.advanceTo(16);
    expect(scheduler.pendingCount).toBe(1);
    expect(loop.diagnostics().health).toMatchObject({
      recoveryAttempts: 1,
      fatalErrorCount: 0,
    });

    scheduler.advanceTo(32);
    expect(render).toHaveBeenCalledTimes(2);
    expect(scheduler.pendingCount).toBe(1);
    expect(onFatalError).not.toHaveBeenCalled();
    expect(scheduler.maximumPending).toBe(1);
    loop.stop();
  });

  it('stops deterministically after the configured consecutive failure limit', () => {
    const scheduler = new ManualFrameScheduler();
    const failure = new Error('fatal render failure');
    const onFatalError = vi.fn();
    const loop = new RenderLoop(() => {
      throw failure;
    }, () => ({
      queueDepth: 1,
      blendDurationMs: 0,
      activeAnimation: 'HELLO',
    }), {
      scheduler,
      maxConsecutiveRenderFailures: 1,
      onFatalError,
    });

    loop.start();
    scheduler.advanceTo(16);
    scheduler.advanceTo(32);

    expect(onFatalError).toHaveBeenCalledOnce();
    expect(onFatalError).toHaveBeenCalledWith(failure);
    expect(scheduler.pendingCount).toBe(0);
    expect(loop.diagnostics().health).toMatchObject({
      recoveryAttempts: 1,
      fatalErrorCount: 1,
    });
  });

  it('maintains exactly one RAF over a simulated long-running session and cleans it up', () => {
    const scheduler = new ManualFrameScheduler();
    const render = vi.fn();
    const healthMonitor = new RenderingHealthMonitor({
      now: () => scheduler.now(),
      schedulerKind: scheduler.kind,
    });
    const loop = new RenderLoop(render, () => ({
      queueDepth: 1,
      blendDurationMs: 0,
      activeAnimation: 'SOAK',
    }), { scheduler, healthMonitor });

    loop.start();
    for (let frame = 1; frame <= 20_000; frame += 1) {
      scheduler.advanceTo(frame * (1_000 / 60));
      expect(scheduler.pendingCount).toBe(1);
    }

    const diagnostics = loop.diagnostics();
    expect(render).toHaveBeenCalledTimes(20_000);
    expect(scheduler.maximumPending).toBe(1);
    expect(diagnostics.health?.renderLoopUptimeMs).toBeGreaterThan(300_000);
    expect(Object.values(diagnostics.health!.frameTimeDistributionMs).every(Number.isFinite))
      .toBe(true);

    const stale = scheduler.takePending();
    loop.stop();
    stale(400_000);

    expect(render).toHaveBeenCalledTimes(20_000);
    expect(scheduler.pendingCount).toBe(0);
  });

  it('invalidates callbacks from a previous generation after restart', () => {
    const scheduler = new ManualFrameScheduler();
    const render = vi.fn();
    const loop = new RenderLoop(render, () => ({
      queueDepth: 1,
      blendDurationMs: 0,
      activeAnimation: 'HELLO',
    }), { scheduler });

    loop.start();
    const stale = scheduler.takePending();
    loop.stop();
    loop.start();
    stale(16);
    scheduler.advanceTo(16);

    expect(render).toHaveBeenCalledOnce();
    expect(scheduler.pendingCount).toBe(1);
    expect(scheduler.maximumPending).toBe(1);
    loop.stop();
  });
});

describe('long-session renderer lifecycle', () => {
  it('releases every visual lease and frame callback across 500 mount cycles', () => {
    let nextHandle = 0;
    const requestAnimationFrame = vi.fn(() => {
      nextHandle += 1;
      return nextHandle;
    });
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame);
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame);
    const assets = new AvatarAssetManager();
    const adapter = new Avatar2DAdapter(fetch, DEFAULT_AVATAR, assets);
    const target = document.createElement('div');

    for (let cycle = 0; cycle < 500; cycle += 1) {
      adapter.mountIdle(target, false);
      expect(assets.diagnostics().activeAssets).toBe(1);
      adapter.destroy();
      expect(assets.diagnostics().activeAssets).toBe(0);
      expect(target.childElementCount).toBe(0);
    }

    expect(requestAnimationFrame).toHaveBeenCalledTimes(500);
    expect(cancelAnimationFrame).toHaveBeenCalledTimes(500);
    assets.dispose();
  // This deliberately constructs and disposes 500 complete SVG rigs. Under the
  // full parallel suite, jsdom can take more than the former 20-second budget
  // even though every lifecycle assertion succeeds. Keep the stress count and
  // allow slower CI hosts enough time to finish the synchronous leak check.
  }, 60_000);
});

describe('SecondaryMotionController reduced-resource behavior', () => {
  function drivenPose(): MotionPose {
    return {
      'left-upper-arm': { rotation: 60 },
      'right-upper-arm': { rotation: -40 },
      'left-hand': { rotation: 24 },
      'right-hand': { rotation: -18 },
    };
  }

  it('scales only secondary motion while preserving approved arm, wrist, and hand values', () => {
    const standard = new SecondaryMotionController();
    const reduced = new SecondaryMotionController();
    standard.seed({
      'left-upper-arm': { rotation: 0 },
      'right-upper-arm': { rotation: 0 },
    });
    reduced.seed({
      'left-upper-arm': { rotation: 0 },
      'right-upper-arm': { rotation: 0 },
    });

    avatarRuntimeResourcePolicy.setMode('standard');
    const standardPose = drivenPose();
    standard.apply(standardPose, 1_000, false);

    avatarRuntimeResourcePolicy.setMode('reduced');
    const reducedPose = drivenPose();
    reduced.apply(reducedPose, 1_000, false);

    for (const part of [
      'left-upper-arm',
      'right-upper-arm',
      'left-hand',
      'right-hand',
    ] as const) {
      expect(reducedPose[part]?.rotation).toBe(standardPose[part]?.rotation);
    }
    for (const part of ['left-clavicle', 'right-clavicle', 'torso', 'head'] as const) {
      const standardRotation = standardPose[part]?.rotation ?? 0;
      const reducedRotation = reducedPose[part]?.rotation ?? 0;
      expect(reducedRotation).toBeCloseTo(standardRotation * 0.4, 8);
    }
  });

  it('preserves the exact input pose when reduced-motion accessibility is enabled', () => {
    avatarRuntimeResourcePolicy.setMode('reduced');
    const secondary = new SecondaryMotionController();
    const pose = drivenPose();
    const before = structuredClone(pose);

    secondary.apply(pose, 1_000, true);

    expect(pose).toEqual(before);
  });
});
