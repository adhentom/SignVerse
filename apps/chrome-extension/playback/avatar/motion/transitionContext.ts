import type { AvatarPoseSnapshot } from '../../types';

const SOURCE_ANIMATION_ID = Symbol('signverse-source-animation-id');

type MotionTransitionSnapshot = AvatarPoseSnapshot & {
  [SOURCE_ANIMATION_ID]?: string;
};

export function attachSourceAnimation(
  pose: AvatarPoseSnapshot,
  animationId: string,
): AvatarPoseSnapshot {
  Object.defineProperty(pose, SOURCE_ANIMATION_ID, {
    configurable: false,
    enumerable: false,
    value: animationId,
    writable: false,
  });
  return pose;
}

export function sourceAnimationId(pose: AvatarPoseSnapshot): string | undefined {
  return (pose as MotionTransitionSnapshot)[SOURCE_ANIMATION_ID];
}
