import type { AvatarPart, AvatarPose } from '../AvatarAnimationEngine';

type Pose = Partial<Record<AvatarPart, AvatarPose>>;

/**
 * Adds a small, non-linguistic readiness motion while the interpreter is idle.
 *
 * This controller must never run over a governed animation clip. Its purpose is
 * only to make the waiting avatar visibly responsive without suggesting that an
 * unavailable interpretation is being signed.
 */
export class IdleReadinessController {
  apply(pose: Pose, time: number, reducedMotion: boolean): void {
    if (reducedMotion) return;

    const wristPhase = Math.sin(time / 420);
    const followThrough = Math.sin(time / 420 - Math.PI / 3);

    addRotation(pose, 'left-hand', wristPhase * 8);
    addRotation(pose, 'right-hand', -wristPhase * 8);
    addRotation(pose, 'left-forearm', followThrough * 1.6);
    addRotation(pose, 'right-forearm', -followThrough * 1.6);
  }
}

function addRotation(pose: Pose, part: AvatarPart, rotation: number): void {
  const component = pose[part];
  if (component) {
    component.rotation = (component.rotation ?? 0) + rotation;
    return;
  }
  pose[part] = { rotation };
}
