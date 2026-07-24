import { describe, expect, it } from 'vitest';

import { CoArticulationController } from '../../playback/avatar/motion/CoArticulationController';
import { TrajectoryGenerator } from '../../playback/avatar/motion/TrajectoryGenerator';
import type { AvatarPoseSnapshot } from '../../playback/types';
import type { MotionPose } from '../../playback/avatar/motion/types';

const source: AvatarPoseSnapshot = {
  'left-upper-arm': { rotation: -30 },
  'left-forearm': { rotation: 10 },
  'left-hand': { rotation: 5 },
};

const target: MotionPose = {
  'left-upper-arm': { rotation: 80 },
  'left-forearm': { rotation: -70 },
  'left-hand': { rotation: 45 },
};

function controller(durationMs = 200): CoArticulationController {
  const value = new CoArticulationController({
    trajectories: new TrajectoryGenerator(8),
    profile: 'precise',
  });
  value.configure(durationMs, undefined, false, 'precise');
  return value;
}

describe('CoArticulationController', () => {
  it('starts at the outgoing pose and completes at the incoming sign endpoint', () => {
    const coArticulation = controller();
    coArticulation.beginTransition(source, 'HELLO');

    expect(coArticulation.apply(target)).toMatchObject(source);
    coArticulation.advance(200);
    expect(coArticulation.apply(target)).toMatchObject(target);
    expect(coArticulation.active).toBe(false);
  });

  it('uses the current blended pose as the source when interrupted', () => {
    const coArticulation = controller();
    coArticulation.beginTransition(source, 'FIRST');
    coArticulation.apply(target);
    coArticulation.advance(80);
    const interruptedPose = coArticulation.apply(target);
    const replacement: MotionPose = {
      'left-upper-arm': { rotation: -120 },
      'left-forearm': { rotation: 110 },
      'left-hand': { rotation: -85 },
    };

    coArticulation.beginTransition(interruptedPose as AvatarPoseSnapshot, 'SECOND');
    expect(coArticulation.apply(replacement)).toEqual(interruptedPose);
    coArticulation.advance(200);
    expect(coArticulation.apply(replacement)).toMatchObject(replacement);
  });

  it('smoothly recovers to idle and preserves an exact neutral endpoint', () => {
    const coArticulation = controller(160);
    const neutral: AvatarPoseSnapshot = {
      'left-upper-arm': { rotation: 0 },
      'left-forearm': { rotation: 0 },
      'left-hand': { rotation: 0 },
    };
    coArticulation.beginIdleRecovery(source, neutral);

    expect(coArticulation.returningToIdle).toBe(true);
    coArticulation.apply({});
    coArticulation.advance(160);
    expect(coArticulation.apply({})).toEqual(neutral);
    expect(coArticulation.active).toBe(false);
  });

  it('tracks repeated-sign co-articulation and bounded diagnostics', () => {
    const coArticulation = controller(200);
    coArticulation.beginTransition(source, 'HELLO');
    coArticulation.apply(target);
    coArticulation.advance(200);
    coArticulation.apply(target);

    coArticulation.beginTransition(target as AvatarPoseSnapshot, 'HELLO');
    coArticulation.apply(target);
    const diagnostics = coArticulation.diagnostics();

    expect(diagnostics).toMatchObject({
      coArticulationUsage: 2,
      repeatedSignTransitions: 1,
      activeMotionProfile: 'precise',
      activeTransitionProfile: 'fast',
    });
    expect(diagnostics.averageTransitionDurationMs).toBeGreaterThan(0);
    expect(diagnostics.blendUtilization).toBeGreaterThan(0);
    expect(diagnostics.blendUtilization).toBeLessThanOrEqual(1);
    expect(diagnostics.trajectorySmoothing.generatedTrajectories).toBe(2);
  });

  it('returns finite poses throughout a transition and cancels cleanly', () => {
    const coArticulation = controller(180);
    coArticulation.beginTransition(source, 'FINITE');
    coArticulation.apply(target);

    for (let elapsed = 0; elapsed < 180; elapsed += 10) {
      coArticulation.advance(10);
      const pose = coArticulation.apply(target);
      for (const part of Object.values(pose)) {
        expect(Object.values(part ?? {})
          .filter((candidate): candidate is number => candidate !== undefined)
          .every(Number.isFinite)).toBe(true);
      }
    }
    coArticulation.cancel();
    expect(coArticulation.active).toBe(false);
    expect(coArticulation.apply(target)).toBe(target);
  });

  it('cancels a transition before completion without sampling again', () => {
    const trajectories = new TrajectoryGenerator(8);
    const coArticulation = new CoArticulationController({
      trajectories,
      profile: 'precise',
    });
    coArticulation.configure(180, undefined, false, 'precise');
    coArticulation.beginTransition(source, 'CANCELLED');
    coArticulation.apply(target);
    coArticulation.advance(50);
    coArticulation.apply(target);
    const samplesBeforeCancel =
      coArticulation.diagnostics().trajectorySmoothing.sampledFrames;

    coArticulation.cancel();
    coArticulation.advance(100);

    expect(coArticulation.active).toBe(false);
    expect(coArticulation.returningToIdle).toBe(false);
    expect(coArticulation.apply(target)).toBe(target);
    expect(coArticulation.diagnostics().trajectorySmoothing.sampledFrames)
      .toBe(samplesBeforeCancel);
    expect(() => {
      coArticulation.dispose();
      coArticulation.dispose();
    }).not.toThrow();
  });

  it('reports trajectory statistics for its own renderer session only', () => {
    const trajectories = new TrajectoryGenerator(8);
    const first = new CoArticulationController({ trajectories, profile: 'precise' });
    const second = new CoArticulationController({ trajectories, profile: 'precise' });
    const unused = new CoArticulationController({ trajectories, profile: 'precise' });
    first.configure(180, undefined, false, 'precise');
    second.configure(180, undefined, false, 'precise');

    first.beginTransition(source, 'SHARED');
    first.apply(target);
    second.beginTransition(source, 'SHARED');
    second.apply(target);

    expect(first.diagnostics().trajectorySmoothing).toMatchObject({
      cacheHits: 0,
      cacheMisses: 1,
      generatedTrajectories: 1,
      sampledFrames: 1,
    });
    expect(second.diagnostics().trajectorySmoothing).toMatchObject({
      cacheHits: 1,
      cacheMisses: 0,
      generatedTrajectories: 0,
      sampledFrames: 1,
    });
    expect(unused.diagnostics().trajectorySmoothing).toEqual({
      cacheHits: 0,
      cacheMisses: 0,
      cacheEvictions: 0,
      generatedTrajectories: 0,
      sampledFrames: 0,
      smoothedJoints: 0,
    });
  });
});
