import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnimationController } from '../../playback/avatar/controllers/AnimationController';
import { BlendController } from '../../playback/avatar/controllers/BlendController';
import { HandController } from '../../playback/avatar/controllers/HandController';
import { IdleReadinessController } from '../../playback/avatar/controllers/IdleReadinessController';
import { RenderLoop } from '../../playback/avatar/controllers/RenderLoop';
import { SecondaryMotionController } from '../../playback/avatar/controllers/SecondaryMotionController';
import type { MotionPose } from '../../playback/avatar/motion/types';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('production avatar controllers', () => {
  it('performs configurable, interruption-safe pose blending', () => {
    const blend = new BlendController();
    blend.configure(200, false);
    blend.beginFrom({ 'left-hand': { rotation: -30 } });
    blend.advance(100);

    expect(blend.apply({ 'left-hand': { rotation: 30 } })['left-hand']?.rotation)
      .toBeCloseTo(0, 5);

    blend.beginFrom({ 'left-hand': { rotation: 12 } });
    expect(blend.apply({ 'left-hand': { rotation: 80 } })['left-hand']?.rotation)
      .toBe(12);
    expect(blend.configuredDurationMs).toBe(200);
  });

  it('blends smoothly back to the neutral signing pose', () => {
    const blend = new BlendController();
    blend.configure(160, false);
    blend.beginReturnToIdle(
      { 'right-forearm': { rotation: 80 } },
      { 'right-forearm': { rotation: 0 } },
    );
    blend.advance(160);

    expect(blend.apply({})['right-forearm']?.rotation).toBe(0);
    expect(blend.returningToIdle).toBe(true);
  });

  it('controls each hand independently through reusable handshape IDs', () => {
    const hands = new HandController();
    const pose = {};

    expect(hands.setShape('left', 'fist')).toBe(true);
    expect(hands.setShape('right', 'point')).toBe(true);
    expect(hands.setShape('right', 'not-a-handshape')).toBe(false);
    hands.apply(pose);

    expect(pose).toMatchObject({
      'left-index-pip': { rotation: 104 },
      'left-thumb-cmc': { rotation: -10 },
      'right-index-pip': { rotation: 2 },
      'right-middle-pip': { rotation: 106 },
    });
  });

  it('keeps approved clip finger articulation authoritative over handshape defaults', () => {
    const hands = new HandController();
    const pose = {
      'left-index-pip': { rotation: 44 },
      'left-index-dip': { rotation: 32 },
    };

    hands.setShape('left', 'fist');
    hands.apply(pose as MotionPose);

    expect(pose['left-index-pip'].rotation).toBe(44);
    expect(pose['left-index-dip'].rotation).toBe(32);
    expect(pose).toMatchObject({ 'left-middle-pip': { rotation: 108 } });
  });

  it('raises one open palm and waves it as a recognizable idle greeting', () => {
    const idle = new IdleReadinessController();
    const initialPose: MotionPose = {
      'right-upper-arm': { rotation: 74 },
      'right-forearm': { rotation: 0 },
      'right-hand': { rotation: 0 },
    };
    const raisedPose: MotionPose = {
      'right-upper-arm': { rotation: 74 },
      'right-forearm': { rotation: 0 },
      'right-hand': { rotation: 0 },
    };

    idle.apply(initialPose, 5_000, false);
    idle.apply(raisedPose, 5_000 + 750 + 2_050 / 12, false);

    expect(initialPose['right-upper-arm']?.rotation).toBe(74);
    expect(raisedPose['right-upper-arm']?.rotation).toBe(20);
    expect(raisedPose['right-forearm']?.rotation).toBe(-112);
    expect(raisedPose['right-hand']?.rotation).toBeCloseTo(22, 5);
    expect(raisedPose['right-hand']?.scaleY).toBe(1);
    expect(raisedPose['left-hand']).toBeUndefined();
  });

  it('returns to rest between greetings and restarts after governed playback', () => {
    const idle = new IdleReadinessController();
    const restingPose: MotionPose = {
      'right-upper-arm': { rotation: 74 },
      'right-forearm': { rotation: 0 },
      'right-hand': { rotation: 0 },
    };

    idle.apply(restingPose, 2_000, false);
    idle.apply(restingPose, 2_000 + 4_000, false);

    expect(restingPose).toEqual({
      'right-upper-arm': { rotation: 74 },
      'right-forearm': { rotation: 0 },
      'right-hand': { rotation: 0 },
    });

    idle.reset();
    idle.apply(restingPose, 20_000, false);
    expect(restingPose['right-upper-arm']?.rotation).toBe(74);
  });

  it('disables idle hand motion when reduced motion is requested', () => {
    const idle = new IdleReadinessController();
    const pose: MotionPose = {
      'left-hand': { rotation: 3 },
      'right-hand': { rotation: -3 },
    };

    idle.apply(pose, 660, true);

    expect(pose).toEqual({
      'left-hand': { rotation: 3 },
      'right-hand': { rotation: -3 },
    });
  });

  it('preserves hold timing and continuous velocity across approved keyframes', () => {
    const animation = new AnimationController({
      id: 'continuous-motion',
      duration: 1,
      keyframes: [
        { offset: 0, pose: { 'left-hand': { rotation: 0 }, head: { rotation: 10 } } },
        { offset: 0.5, pose: { 'left-hand': { rotation: 30 }, head: { rotation: 10 } } },
        { offset: 0.75, pose: { 'left-hand': { rotation: 62 }, head: { rotation: 10 } } },
        { offset: 1, pose: { 'left-hand': { rotation: 90 }, head: { rotation: 35 } } },
      ],
    });

    expect(animation.sampleAt(0.6).head?.rotation).toBe(10);
    const before = animation.sampleAt(0.49)['left-hand']?.rotation ?? 0;
    const boundary = animation.sampleAt(0.5)['left-hand']?.rotation ?? 0;
    const after = animation.sampleAt(0.51)['left-hand']?.rotation ?? 0;
    expect(Math.abs((boundary - before) - (after - boundary))).toBeLessThan(0.08);
    expect(animation.sampleAt(0)['left-hand']?.rotation).toBe(0);
    expect(animation.sampleAt(1)['left-hand']?.rotation).toBe(90);
  });

  it('limits cubic sampling to the approved keyframe interval', () => {
    const animation = new AnimationController({
      id: 'overshoot-guard',
      duration: 1,
      keyframes: [
        { offset: 0, pose: { 'left-hand': { rotation: 0 } } },
        { offset: 0.2, pose: { 'left-hand': { rotation: 80 } } },
        { offset: 0.8, pose: { 'left-hand': { rotation: 82 } } },
        { offset: 1, pose: { 'left-hand': { rotation: 160 } } },
      ],
    });

    for (let frame = 20; frame <= 80; frame += 1) {
      const rotation = animation.sampleAt(frame / 100)['left-hand']?.rotation ?? 0;
      expect(rotation).toBeGreaterThanOrEqual(80);
      expect(rotation).toBeLessThanOrEqual(82);
    }
  });

  it('does not start sparse joint motion before its first governed keyframe', () => {
    const animation = new AnimationController({
      id: 'sparse-joint',
      duration: 1,
      keyframes: [
        { offset: 0, pose: {} },
        { offset: 0.5, pose: {} },
        { offset: 1, pose: { 'left-index-pip': { rotation: 60 } } },
      ],
    });

    expect(animation.sampleAt(0.75)['left-index-pip']).toBeUndefined();
    expect(animation.sampleAt(1)['left-index-pip']?.rotation).toBe(60);
  });

  it('adds bounded follow-through without replacing approved head motion', () => {
    const secondary = new SecondaryMotionController();
    secondary.configure('expressive');
    const pose: MotionPose = {
      'left-upper-arm': { rotation: 80 },
      'right-upper-arm': { rotation: -65 },
      head: { rotation: 7 },
    };

    secondary.apply(pose, 1_000, false);

    expect(pose.head?.rotation ?? 0).toBeGreaterThan(6);
    expect(pose.head?.rotation ?? 0).toBeLessThan(8);
    expect(Math.abs(pose['left-clavicle']?.rotation ?? 0)).toBeLessThanOrEqual(2.5);
    expect(Math.abs(pose['right-clavicle']?.rotation ?? 0)).toBeLessThanOrEqual(2.5);
    expect(Math.abs(pose.torso?.rotation ?? 0)).toBeLessThanOrEqual(1.2);
  });

  it('does not drift shoulders or torso during a held signing pose', () => {
    const secondary = new SecondaryMotionController();
    const held: MotionPose = {
      'left-upper-arm': { rotation: 80 },
      'right-upper-arm': { rotation: -65 },
    };
    secondary.seed(held);

    for (let frame = 0; frame < 30; frame += 1) {
      const pose: MotionPose = structuredClone(held);
      secondary.apply(pose, frame * 16.67, false);
      expect(pose['left-clavicle']?.rotation ?? 0).toBe(0);
      expect(pose['right-clavicle']?.rotation ?? 0).toBe(0);
      expect(pose.torso?.rotation ?? 0).toBe(0);
    }
  });

  it('collects rendering-only performance diagnostics and dropped frames', () => {
    let callback: FrameRequestCallback | undefined;
    vi.spyOn(performance, 'now').mockReturnValue(0);
    vi.stubGlobal('requestAnimationFrame', vi.fn((next: FrameRequestCallback) => {
      callback = next;
      return 1;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const render = vi.fn();
    const loop = new RenderLoop(render, () => ({
      queueDepth: 2,
      blendDurationMs: 180,
      activeAnimation: 'HELLO',
    }));

    loop.start();
    callback?.(16);
    callback?.(616);

    expect(loop.diagnostics()).toMatchObject({
      animationQueueDepth: 2,
      blendDurationMs: 180,
      activeAnimation: 'HELLO',
    });
    expect(loop.diagnostics().fps).toBeGreaterThan(0);
    expect(loop.diagnostics().droppedRenderFrames).toBeGreaterThan(0);
    expect(render).toHaveBeenCalledTimes(2);
    loop.stop();
  });

  it('ignores a stale animation callback after stop and restart', () => {
    const callbacks: FrameRequestCallback[] = [];
    vi.spyOn(performance, 'now').mockReturnValue(0);
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const render = vi.fn();
    const loop = new RenderLoop(render, () => ({
      queueDepth: 0,
      blendDurationMs: 0,
      activeAnimation: 'idle',
    }));

    loop.start();
    const stale = callbacks.shift()!;
    loop.stop();
    loop.start();
    const current = callbacks.shift()!;
    stale(16);
    current(16);

    expect(render).toHaveBeenCalledTimes(1);
    expect(callbacks).toHaveLength(1);
    loop.stop();
  });
});
