import { describe, expect, it } from 'vitest';

import { WristFingerRefinementController } from '../../playback/avatar/motion/WristFingerRefinementController';
import type { MotionPose } from '../../playback/avatar/motion/types';

describe('WristFingerRefinementController', () => {
  it('interpolates wrist rotation over the shortest angular path', () => {
    const refinement = new WristFingerRefinementController();
    refinement.configure('precise');
    refinement.seed({ 'left-hand': { rotation: 170 } });
    const pose: MotionPose = { 'left-hand': { rotation: -170 } };

    refinement.apply(pose, 0.02, false, false);

    expect(pose['left-hand']?.rotation).toBeGreaterThan(170);
    expect(pose['left-hand']?.rotation).toBeLessThan(190);
  });

  it('uses one interpolation phase for bilateral hand synchronization', () => {
    const refinement = new WristFingerRefinementController();
    refinement.configure('conversational');
    refinement.seed({
      'left-hand': { rotation: 0 },
      'right-hand': { rotation: 0 },
      'left-index-pip': { rotation: 0 },
      'right-index-pip': { rotation: 0 },
    });
    const pose: MotionPose = {
      'left-hand': { rotation: 90 },
      'right-hand': { rotation: 90 },
      'left-index-pip': { rotation: 70 },
      'right-index-pip': { rotation: 70 },
    };

    refinement.apply(pose, 0.016, false, false);

    expect(pose['left-hand']?.rotation).toBeCloseTo(pose['right-hand']?.rotation ?? 0, 8);
    expect(pose['left-index-pip']?.rotation)
      .toBeCloseTo(pose['right-index-pip']?.rotation ?? 0, 8);
  });

  it('keeps asymmetric wrists and thumbs on the same bilateral phase', () => {
    const refinement = new WristFingerRefinementController();
    refinement.configure('educational');
    refinement.seed({
      'left-hand': { rotation: 0 },
      'right-hand': { rotation: 80 },
      'left-thumb-cmc': { rotation: 0 },
      'right-thumb-cmc': { rotation: 30 },
    });
    const pose: MotionPose = {
      'left-hand': { rotation: 90 },
      'right-hand': { rotation: -40 },
      'left-thumb-cmc': { rotation: 60 },
      'right-thumb-cmc': { rotation: -30 },
    };

    refinement.apply(pose, 0.016, false, false);

    const leftWristPhase = (pose['left-hand']?.rotation ?? 0) / 90;
    const rightWristPhase = (80 - (pose['right-hand']?.rotation ?? 80)) / 120;
    const leftThumbPhase = (pose['left-thumb-cmc']?.rotation ?? 0) / 60;
    const rightThumbPhase = (30 - (pose['right-thumb-cmc']?.rotation ?? 30)) / 60;
    expect(leftWristPhase).toBeCloseTo(rightWristPhase, 8);
    expect(leftThumbPhase).toBeCloseTo(rightThumbPhase, 8);
  });

  it('preserves exact approved values on terminal and reduced-motion frames', () => {
    const refinement = new WristFingerRefinementController();
    refinement.seed({
      'left-hand': { rotation: 10 },
      'left-thumb-cmc': { rotation: -5 },
    });
    const terminal: MotionPose = {
      'left-hand': { rotation: 95 },
      'left-thumb-cmc': { rotation: 42 },
    };
    refinement.apply(terminal, 0.016, true, false);
    expect(terminal).toEqual({
      'left-hand': { rotation: 95 },
      'left-thumb-cmc': { rotation: 42 },
    });

    const reduced: MotionPose = {
      'left-hand': { rotation: -35 },
      'left-thumb-cmc': { rotation: 12 },
    };
    refinement.apply(reduced, 0.016, false, true);
    expect(reduced).toEqual({
      'left-hand': { rotation: -35 },
      'left-thumb-cmc': { rotation: 12 },
    });
  });

  it('leaves non-hand joints untouched, emits finite values, and records diagnostics', () => {
    const refinement = new WristFingerRefinementController();
    refinement.seed({
      'left-hand': { rotation: 0 },
      'left-index-pip': { rotation: 0 },
    });
    const pose: MotionPose = {
      'left-upper-arm': { rotation: 75 },
      'left-hand': { rotation: 40 },
      'left-index-pip': { rotation: 80 },
    };

    refinement.apply(pose, 0.016, false, false);

    expect(pose['left-upper-arm']).toEqual({ rotation: 75 });
    expect(Object.values(pose).flatMap((part) => Object.values(part ?? {}))
      .every(Number.isFinite)).toBe(true);
    expect(refinement.samples).toBe(2);

    refinement.reset();
    expect(refinement.samples).toBe(0);
    const afterReset: MotionPose = { 'left-hand': { rotation: 25 } };
    refinement.apply(afterReset, 0.016, false, false);
    expect(afterReset['left-hand']?.rotation).toBe(25);
  });
});
