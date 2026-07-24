import { describe, expect, it } from 'vitest';

import { MotionPlanner } from '../../playback/avatar/motion/MotionPlanner';
import { resolveMotionProfile } from '../../playback/avatar/motion/motionProfiles';
import { TrajectoryGenerator } from '../../playback/avatar/motion/TrajectoryGenerator';
import type { AvatarPoseSnapshot } from '../../playback/types';
import type { MotionPose } from '../../playback/avatar/motion/types';

const source: AvatarPoseSnapshot = {
  'left-upper-arm': { rotation: 0, x: 0, y: 0 },
  'left-forearm': { rotation: 0 },
  'left-hand': { rotation: 170 },
};

const target: MotionPose = {
  'left-upper-arm': { rotation: 90, x: 12, y: -8 },
  'left-forearm': { rotation: -75 },
  'left-hand': { rotation: -170 },
};

function trajectory(
  generator = new TrajectoryGenerator(8),
  animationId = 'trajectory',
) {
  const plan = new MotionPlanner().plan({
    source,
    target,
    animationId,
    profile: resolveMotionProfile('expressive'),
    reducedMotion: false,
  });
  return generator.generate(source, target, plan);
}

describe('TrajectoryGenerator', () => {
  it('preserves exact source and approved target endpoints', () => {
    const generated = trajectory();

    expect(generated.sample(0)).toMatchObject(source);
    expect(generated.sample(1)).toMatchObject({
      'left-upper-arm': { rotation: 90, x: 12, y: -8 },
      'left-forearm': { rotation: -75 },
    });
    // The equivalent unwrapped endpoint avoids a 340-degree wrist spin.
    expect(generated.sample(1)['left-hand']?.rotation).toBeCloseTo(190, 8);
  });

  it('uses a curved eased trajectory rather than linearly snapping joints', () => {
    const generated = trajectory();
    const quarter = generated.sample(0.25)['left-upper-arm']?.rotation;
    const linearQuarter = 90 * 0.25;

    expect(quarter).toBeDefined();
    expect(quarter).not.toBeCloseTo(linearQuarter, 3);
    expect(quarter!).toBeGreaterThan(0);
    expect(quarter!).toBeLessThan(90);
  });

  it('applies deterministic transition-profile easing without changing endpoints', () => {
    const planner = new MotionPlanner();
    const generator = new TrajectoryGenerator(8);
    const fastPlan = planner.plan({
      source,
      target,
      animationId: 'fast-profile',
      transitionHint: 'fast',
      profile: resolveMotionProfile('precise'),
      reducedMotion: false,
    });
    const slowPlan = planner.plan({
      source,
      target,
      animationId: 'slow-profile',
      transitionHint: 'slow',
      profile: resolveMotionProfile('precise'),
      reducedMotion: false,
    });
    const fast = generator.generate(source, target, fastPlan);
    const slow = generator.generate(source, target, slowPlan);

    expect(fast.sample(0.35)['left-upper-arm']?.rotation)
      .toBeGreaterThan(slow.sample(0.35)['left-upper-arm']?.rotation ?? 0);
    expect(fast.sample(0)).toMatchObject(source);
    expect(slow.sample(1)['left-upper-arm']?.rotation).toBe(90);
  });

  it('takes the shortest angular path across the wrist wrap boundary', () => {
    const halfway = trajectory().sample(0.5)['left-hand']?.rotation;

    expect(halfway).toBeGreaterThan(175);
    expect(halfway).toBeLessThan(185);
    expect(Math.abs(halfway!)).toBeGreaterThan(170);
  });

  it('keeps every generated value finite and does not invent optional scale values', () => {
    const generated = trajectory();

    for (let frame = 0; frame <= 60; frame += 1) {
      const pose = generated.sample(frame / 60);
      for (const value of Object.values(pose)) {
        for (const component of Object.values(value ?? {}).filter(
          (candidate): candidate is number => candidate !== undefined,
        )) {
          expect(Number.isFinite(component)).toBe(true);
        }
      }
    }
    expect(generated.sample(0.5)['left-hand']?.scaleX).toBeUndefined();
    expect(generated.sample(0.5)['left-hand']?.scaleY).toBeUndefined();
  });

  it('uses a bounded LRU cache and reports hits, evictions, and sampled frames', () => {
    const generator = new TrajectoryGenerator(2);
    trajectory(generator, 'one').sample(0.25);
    trajectory(generator, 'two');
    trajectory(generator, 'one').sample(0.75);
    trajectory(generator, 'three');

    expect(generator.statistics()).toMatchObject({
      cacheHits: 1,
      cacheMisses: 3,
      cacheEvictions: 1,
      generatedTrajectories: 3,
      sampledFrames: 2,
    });
    expect(generator.statistics().smoothedJoints).toBeGreaterThan(0);
  });

  it('releases cached trajectories on cleanup', () => {
    const generator = new TrajectoryGenerator(2);
    trajectory(generator, 'cleanup');
    trajectory(generator, 'cleanup');
    expect(generator.statistics().cacheHits).toBe(1);

    generator.clear();
    trajectory(generator, 'cleanup');

    expect(generator.statistics()).toMatchObject({
      cacheHits: 1,
      cacheMisses: 2,
    });
  });

  it('reuses a bounded sample buffer during a long transition', () => {
    const generator = new TrajectoryGenerator(2);
    const generated = trajectory(generator, 'long-session');
    const firstBuffer = generated.sample(0);
    for (let frame = 1; frame <= 2_000; frame += 1) {
      expect(generated.sample(frame / 2_000)).toBe(firstBuffer);
    }

    expect(generator.statistics()).toMatchObject({
      cacheMisses: 1,
      generatedTrajectories: 1,
      sampledFrames: 2_001,
      cacheEvictions: 0,
    });
  });

  it('does not reuse a cached trajectory for a slightly different approved endpoint', () => {
    const generator = new TrajectoryGenerator(8);
    const planner = new MotionPlanner();
    const firstSource: AvatarPoseSnapshot = {
      'left-hand': { rotation: 10.01 },
    };
    const secondSource: AvatarPoseSnapshot = {
      'left-hand': { rotation: 10.04 },
    };
    const sharedTarget: MotionPose = {
      'left-hand': { rotation: 40 },
    };
    const firstPlan = planner.plan({
      source: firstSource,
      target: sharedTarget,
      animationId: 'endpoint-precision',
      profile: resolveMotionProfile('precise'),
      reducedMotion: false,
    });
    const secondPlan = planner.plan({
      source: secondSource,
      target: sharedTarget,
      animationId: 'endpoint-precision',
      profile: resolveMotionProfile('precise'),
      reducedMotion: false,
    });

    generator.generate(firstSource, sharedTarget, firstPlan);
    const second = generator.generate(secondSource, sharedTarget, secondPlan);

    expect(second.sample(0)['left-hand']?.rotation).toBe(10.04);
    expect(generator.statistics()).toMatchObject({
      cacheHits: 0,
      cacheMisses: 2,
    });
  });
});
