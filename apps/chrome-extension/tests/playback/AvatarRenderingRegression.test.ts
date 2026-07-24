import { describe, expect, it } from 'vitest';
import { BlendController } from '../../playback/avatar/controllers/BlendController';
import { SecondaryMotionController } from '../../playback/avatar/controllers/SecondaryMotionController';
import { MotionPlanner } from '../../playback/avatar/motion/MotionPlanner';
import { resolveMotionProfile } from '../../playback/avatar/motion/motionProfiles';
import { TrajectoryGenerator } from '../../playback/avatar/motion/TrajectoryGenerator';
import { SignVerseSkeletalRig } from '../../playback/avatar/signVerseInterpreter/SignVerseSkeletalRig';
import { createSignVerseInterpreterSvg } from '../../playback/avatar/signVerseInterpreter/createSignVerseInterpreterSvg';
import { SIGNVERSE_INTERPRETER_GEOMETRY } from '../../playback/avatar/signVerseInterpreter/interpreterGeometry';

describe('avatar rendering regression', () => {
  it('preserves connected, fixed-length arms during blended secondary motion', () => {
    const rig = new SignVerseSkeletalRig(createSignVerseInterpreterSvg());
    const blend = new BlendController();
    blend.configure(180, false);
    blend.beginFrom({
      'left-upper-arm': { rotation: 150 },
      'left-forearm': { rotation: -80 },
    });
    blend.advance(90);
    const pose = blend.apply({
      'left-upper-arm': { rotation: -150 },
      'left-forearm': { rotation: 90 },
      'right-upper-arm': { rotation: 70 },
    });
    new SecondaryMotionController().apply(pose, 1_000, false);
    rig.applyPose(pose, 1);

    for (const side of ['left', 'right'] as const) {
      const { shoulder, elbow, wrist } = rig.armChain(side);
      expect(Math.hypot(elbow[0] - shoulder[0], elbow[1] - shoulder[1]))
        .toBeCloseTo(SIGNVERSE_INTERPRETER_GEOMETRY.upperArmLength, 8);
      expect(Math.hypot(wrist[0] - elbow[0], wrist[1] - elbow[1]))
        .toBeCloseTo(SIGNVERSE_INTERPRETER_GEOMETRY.forearmLength, 8);
    }
  });

  it('preserves connected arm chains along every curved co-articulation sample', () => {
    const rig = new SignVerseSkeletalRig(createSignVerseInterpreterSvg());
    const source = rig.neutralPose();
    const target = {
      ...source,
      'left-upper-arm': { rotation: 165 },
      'left-forearm': { rotation: -115 },
      'left-hand': { rotation: 72, scaleY: 0.82 },
      'right-upper-arm': { rotation: 25 },
      'right-forearm': { rotation: 105 },
      'right-hand': { rotation: -65, scaleY: 0.74 },
    };
    const plan = new MotionPlanner().plan({
      source,
      target,
      animationId: 'connected-arms-regression',
      profile: resolveMotionProfile('conversational'),
      reducedMotion: false,
    });
    const trajectory = new TrajectoryGenerator(4).generate(source, target, plan);

    for (let frame = 0; frame <= 30; frame += 1) {
      const pose = trajectory.sample(frame / 30);
      rig.applyPose(pose, 1);
      for (const side of ['left', 'right'] as const) {
        const { shoulder, elbow, wrist } = rig.armChain(side);
        expect([...shoulder, ...elbow, ...wrist].every(Number.isFinite)).toBe(true);
        expect(Math.hypot(elbow[0] - shoulder[0], elbow[1] - shoulder[1]))
          .toBeCloseTo(SIGNVERSE_INTERPRETER_GEOMETRY.upperArmLength, 8);
        expect(Math.hypot(wrist[0] - elbow[0], wrist[1] - elbow[1]))
          .toBeCloseTo(SIGNVERSE_INTERPRETER_GEOMETRY.forearmLength, 8);
      }
    }
  });
});
