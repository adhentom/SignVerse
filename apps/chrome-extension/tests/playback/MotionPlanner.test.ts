import { describe, expect, it } from 'vitest';

import { MotionPlanner } from '../../playback/avatar/motion/MotionPlanner';
import {
  MOTION_PROFILES,
  resolveMotionProfile,
  resolveTransitionProfile,
} from '../../playback/avatar/motion/motionProfiles';
import type { MotionPlanInput } from '../../playback/avatar/motion/types';

const planner = new MotionPlanner();

function input(overrides: Partial<MotionPlanInput> = {}): MotionPlanInput {
  return {
    source: {
      'left-upper-arm': { rotation: -30 },
      'left-forearm': { rotation: 15 },
      'right-upper-arm': { rotation: 20 },
    },
    target: {
      'left-upper-arm': { rotation: 80 },
      'left-forearm': { rotation: -65 },
      'right-upper-arm': { rotation: -40 },
    },
    animationId: 'HELLO',
    profile: resolveMotionProfile('precise'),
    reducedMotion: false,
    ...overrides,
  };
}

describe('MotionPlanner', () => {
  it('resolves reusable motion profiles and aliases deterministically', () => {
    expect(resolveMotionProfile('DEFAULT')).toBe(MOTION_PROFILES.precise);
    expect(resolveMotionProfile('directional')).toBe(MOTION_PROFILES.conversational);
    expect(resolveMotionProfile('emphasis')).toBe(MOTION_PROFILES.expressive);
    expect(resolveMotionProfile('slow')).toBe(MOTION_PROFILES.educational);
    expect(resolveMotionProfile('unknown')).toBe(MOTION_PROFILES.precise);
    expect(resolveTransitionProfile('DIRECTIONAL')).toBe('directional');
    expect(resolveTransitionProfile('unknown')).toBe('default');

    const first = planner.plan(input());
    const second = planner.plan(input());
    expect(second).toEqual(first);
  });

  it('honours requested transition durations while enforcing profile bounds', () => {
    const requested = planner.plan(input({ requestedDurationMs: 225 }));
    const excessive = planner.plan(input({ requestedDurationMs: 10_000 }));
    const negative = planner.plan(input({ requestedDurationMs: -50 }));

    expect(requested.durationMs).toBe(225);
    expect(excessive.durationMs).toBe(MOTION_PROFILES.precise.maximumTransitionMs);
    expect(negative.durationMs).toBe(0);
  });

  it('fits transitions inside short cue intervals without changing cue timestamps', () => {
    const plan = planner.plan(input({
      requestedDurationMs: 300,
      availableDurationMs: 200,
    }));

    expect(plan.durationMs).toBe(90);
    expect(plan.durationMs).toBeLessThan(200);
  });

  it('detects repeated signs and shortens their deterministic re-entry', () => {
    const plan = planner.plan(input({
      previousAnimationId: 'HELLO',
      requestedDurationMs: 200,
    }));

    expect(plan.repeatedSign).toBe(true);
    expect(plan.transitionProfile).toBe('fast');
    expect(plan.durationMs).toBe(140);
  });

  it('selects a directional transition for large abrupt changes', () => {
    const plan = planner.plan(input({
      source: {
        'left-upper-arm': { rotation: -170 },
        'right-upper-arm': { rotation: -170 },
        'left-forearm': { rotation: -170 },
      },
      target: {
        'left-upper-arm': { rotation: 0 },
        'right-upper-arm': { rotation: 0 },
        'left-forearm': { rotation: 0 },
      },
    }));

    expect(plan.abruptDirectionChanges).toBe(3);
    expect(plan.transitionProfile).toBe('directional');
    expect(plan.transitionQuality).toBeGreaterThanOrEqual(0);
    expect(plan.transitionQuality).toBeLessThanOrEqual(1);
  });

  it('removes transition time in reduced-motion mode without changing the pose plan', () => {
    const plan = planner.plan(input({
      requestedDurationMs: 250,
      reducedMotion: true,
    }));

    expect(plan.durationMs).toBe(0);
    expect(plan.pathLength).toBeGreaterThan(0);
    expect(Number.isFinite(plan.transitionQuality)).toBe(true);
  });
});
