import type { AvatarPart, AvatarPose } from '../AvatarAnimationEngine';
import { resolveMotionProfile } from '../motion/motionProfiles';
import { avatarRuntimeResourcePolicy } from '../runtime';

type Pose = Partial<Record<AvatarPart, AvatarPose>>;

export class SecondaryMotionController {
  private lastTime?: number;
  private leftVelocity = 0;
  private rightVelocity = 0;
  private previousLeft = 0;
  private previousRight = 0;
  private scale = resolveMotionProfile('precise').secondaryMotionScale;

  configure(profile: string): void {
    this.scale = resolveMotionProfile(profile).secondaryMotionScale;
  }

  seed(pose: Record<string, { rotation?: number }>): void {
    this.previousLeft = pose['left-upper-arm']?.rotation ?? 0;
    this.previousRight = pose['right-upper-arm']?.rotation ?? 0;
    this.leftVelocity = 0;
    this.rightVelocity = 0;
    this.lastTime = undefined;
  }

  apply(pose: Pose, time: number, reducedMotion: boolean): void {
    if (reducedMotion) return;
    const resourceScale = avatarRuntimeResourcePolicy.current.secondaryMotionScale;
    const leftArm = pose['left-upper-arm']?.rotation ?? 0;
    const rightArm = pose['right-upper-arm']?.rotation ?? 0;
    const elapsed = this.lastTime === undefined
      ? 1 / 60
      : clamp((time - this.lastTime) / 1_000, 1 / 240, 0.1);
    this.lastTime = time;
    this.leftVelocity = smooth(
      this.leftVelocity,
      angleDelta(this.previousLeft, leftArm) / elapsed,
      0.18,
    );
    this.rightVelocity = smooth(
      this.rightVelocity,
      angleDelta(this.previousRight, rightArm) / elapsed,
      0.18,
    );
    this.previousLeft = leftArm;
    this.previousRight = rightArm;
    addRotation(
      pose,
      'left-clavicle',
      clamp(this.leftVelocity * 0.0014 * this.scale * resourceScale, -2.5, 2.5),
    );
    addRotation(
      pose,
      'right-clavicle',
      clamp(this.rightVelocity * 0.0014 * this.scale * resourceScale, -2.5, 2.5),
    );
    addRotation(
      pose,
      'torso',
      clamp(
        -(this.leftVelocity + this.rightVelocity) * 0.0004 * this.scale * resourceScale,
        -1.2,
        1.2,
      ),
    );
    const inertia = clamp(
      -(this.leftVelocity + this.rightVelocity) * 0.00035,
      -0.35,
      0.35,
    );
    addRotation(
      pose,
      'head',
      (Math.sin(time / 1_350) * 0.45 + inertia) * this.scale * resourceScale,
    );
  }

  reset(): void {
    this.lastTime = undefined;
    this.leftVelocity = 0;
    this.rightVelocity = 0;
    this.previousLeft = 0;
    this.previousRight = 0;
  }
}

function addRotation(pose: Pose, part: AvatarPart, rotation: number): void {
  const component = pose[part];
  const next = (component?.rotation ?? 0) + rotation;
  const normalized = next === 0 ? 0 : next;
  if (component) component.rotation = normalized;
  else pose[part] = { rotation: normalized };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function smooth(previous: number, target: number, amount: number): number {
  return previous + (target - previous) * amount;
}

function angleDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}
