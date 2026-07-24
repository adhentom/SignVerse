import type { AvatarPart, AvatarPose } from '../AvatarAnimationEngine';
import type { AvatarPoseSnapshot } from '../../types';
import { SignVerseSkeletalRig } from '../signVerseInterpreter/SignVerseSkeletalRig';

type Pose = Partial<Record<AvatarPart, AvatarPose>>;

export class RigController {
  readonly rig: SignVerseSkeletalRig;

  constructor(root: SVGSVGElement) {
    this.rig = new SignVerseSkeletalRig(root);
  }

  apply(pose: Pose, smoothing: number): void {
    this.rig.applyPose(pose, smoothing);
  }

  renderIdle(time: number, reducedMotion: boolean): void {
    const breathing = reducedMotion ? 0 : Math.sin(time / 900);
    this.rig.applyRootIdle(breathing * 1.6, 1 + breathing * 0.004);
    this.rig.setBlink(reducedMotion ? 1 : blinkOpenness(time));
    this.rig.setGaze(0, 0);
  }

  snapshot(): AvatarPoseSnapshot {
    return this.rig.snapshotPose();
  }

  neutralPose(): AvatarPoseSnapshot {
    return this.rig.neutralPose();
  }
}

function blinkOpenness(time: number): number {
  const phase = time % 3_200;
  if (phase < 80) return 1 - phase / 80;
  if (phase < 160) return (phase - 80) / 80;
  return 1;
}
