import type { AvatarPoseSnapshot } from '../../types';
import type { AvatarPart } from '../AvatarAnimationEngine';
import { interpolateAngle } from '../controllers/AnimationController';
import { resolveMotionProfile } from './motionProfiles';
import type { MotionPose, MotionProfile } from './types';

const REFINED_PART =
  /(?:-hand$|-(?:thumb|index|middle|ring|little)(?:-(?:cmc|mcp|pip|dip|middle|distal))?$)/u;

export class WristFingerRefinementController {
  private readonly rotations = new Map<AvatarPart, number>();
  private profile: MotionProfile = resolveMotionProfile('precise');
  private refinedSamples = 0;

  configure(profile: string): void {
    this.profile = resolveMotionProfile(profile);
  }

  seed(source: AvatarPoseSnapshot): void {
    this.rotations.clear();
    for (const [part, pose] of Object.entries(source)) {
      if (REFINED_PART.test(part) && Number.isFinite(pose.rotation)) {
        this.rotations.set(part as AvatarPart, pose.rotation!);
      }
    }
  }

  apply(
    pose: MotionPose,
    elapsedSeconds: number,
    terminalFrame: boolean,
    reducedMotion: boolean,
  ): void {
    const elapsed = Math.max(0, Math.min(0.1, elapsedSeconds));
    const response = 10 + (1 - this.profile.velocitySmoothing) * 45;
    const sharedAlpha = terminalFrame || reducedMotion
      ? 1
      : 1 - Math.exp(-elapsed * response);
    for (const part of Object.keys(pose) as AvatarPart[]) {
      if (!REFINED_PART.test(part)) continue;
      const target = pose[part]?.rotation;
      if (!Number.isFinite(target)) continue;
      const previous = this.rotations.get(part);
      if (previous === undefined || sharedAlpha >= 1) {
        this.rotations.set(part, target!);
        continue;
      }
      const next = interpolateAngle(previous, target, sharedAlpha);
      this.rotations.set(part, next);
      const component = pose[part];
      if (component) component.rotation = next;
      else pose[part] = { rotation: next };
      this.refinedSamples += 1;
    }
  }

  reset(): void {
    this.rotations.clear();
    this.refinedSamples = 0;
  }

  get samples(): number {
    return this.refinedSamples;
  }
}
