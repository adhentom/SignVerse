import type { AvatarPoseSnapshot } from '../../types';
import type { AvatarPart, AvatarPose } from '../AvatarAnimationEngine';
import { resolveTransitionProfile } from './motionProfiles';
import type {
  MotionPlan,
  MotionPlanInput,
  MotionPose,
  MotionTransitionProfile,
} from './types';

const REPEATED_PATH_THRESHOLD = 10;

export class MotionPlanner {
  plan(input: MotionPlanInput): MotionPlan {
    const pathLength = posePathLength(input.source, input.target);
    const repeatedSign = input.previousAnimationId === input.animationId;
    const minimalTravel = pathLength <= REPEATED_PATH_THRESHOLD;
    const abruptDirectionChanges = abruptChanges(input.source, input.target);
    const transitionProfile = chooseTransitionProfile(
      input.transitionHint,
      pathLength,
      abruptDirectionChanges,
      repeatedSign || minimalTravel,
    );
    const durationMs = input.reducedMotion
      ? 0
      : transitionDuration(
        input.requestedDurationMs,
        input.availableDurationMs,
        pathLength,
        abruptDirectionChanges,
        repeatedSign || minimalTravel,
        input.profile,
      );
    const qualityPenalty = Math.min(0.55, pathLength / 1_800) +
      Math.min(0.25, abruptDirectionChanges * 0.035);
    return Object.freeze({
      animationId: input.animationId,
      profile: input.profile,
      transitionProfile,
      durationMs,
      pathLength,
      repeatedSign,
      abruptDirectionChanges,
      transitionQuality: clamp(1 - qualityPenalty, 0, 1),
    });
  }
}

export function posePathLength(source: AvatarPoseSnapshot, target: MotionPose): number {
  const parts = new Set([...Object.keys(source), ...Object.keys(target)] as AvatarPart[]);
  let distance = 0;
  for (const part of parts) {
    const from = source[part] ?? {};
    const to = target[part] ?? from;
    const rotation = Math.abs(shortestAngle(from.rotation, to.rotation));
    const x = (to.x ?? from.x ?? 0) - (from.x ?? 0);
    const y = (to.y ?? from.y ?? 0) - (from.y ?? 0);
    distance += Math.hypot(x, y) + rotation * partWeight(part);
  }
  return distance;
}

function transitionDuration(
  requested: number | undefined,
  available: number | undefined,
  pathLength: number,
  abruptDirectionChanges: number,
  repeated: boolean,
  profile: MotionPlanInput['profile'],
): number {
  const availableMaximum = Number.isFinite(available)
    ? Math.max(0, available!) * 0.45
    : profile.maximumTransitionMs;
  const maximum = Math.min(profile.maximumTransitionMs, availableMaximum);
  if (maximum <= 0) return 0;
  if (Number.isFinite(requested)) {
    const bounded = clamp(requested!, 0, maximum);
    return repeated ? Math.round(bounded * profile.repeatedSignScale) : bounded;
  }
  const estimated = profile.baseTransitionMs +
    Math.min(120, pathLength * 0.32) +
    abruptDirectionChanges * 8;
  const adjusted = repeated ? estimated * profile.repeatedSignScale : estimated;
  return Math.round(clamp(adjusted, Math.min(profile.minimumTransitionMs, maximum), maximum));
}

function chooseTransitionProfile(
  hint: string | undefined,
  pathLength: number,
  abruptDirectionChanges: number,
  repeated: boolean,
): MotionTransitionProfile {
  const requested = resolveTransitionProfile(hint);
  if (requested !== 'default') return requested;
  if (repeated) return 'fast';
  if (abruptDirectionChanges > 2 || pathLength > 450) return 'directional';
  return 'default';
}

function abruptChanges(source: AvatarPoseSnapshot, target: MotionPose): number {
  let count = 0;
  for (const part of Object.keys(target) as AvatarPart[]) {
    const delta = Math.abs(shortestAngle(source[part]?.rotation, target[part]?.rotation));
    if (delta > 110) count += 1;
  }
  return count;
}

function shortestAngle(from = 0, to = 0): number {
  return ((to - from + 540) % 360) - 180;
}

function partWeight(part: AvatarPart): number {
  if (part.includes('hand')) return 1;
  if (part.includes('forearm')) return 0.9;
  if (part.includes('upper-arm') || part.includes('clavicle')) return 0.72;
  if (/(?:thumb|index|middle|ring|little)/u.test(part)) return 0.28;
  if (part === 'head' || part === 'neck' || part === 'torso') return 0.45;
  return 0.2;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function mergeWithNeutral(
  neutral: AvatarPoseSnapshot,
  target: MotionPose,
  output: MotionPose = {},
): MotionPose {
  for (const part in output) {
    if (!(part in neutral) && !(part in target)) delete output[part as AvatarPart];
  }
  for (const [part, pose] of Object.entries(neutral)) {
    const avatarPart = part as AvatarPart;
    const component = output[avatarPart] ?? {};
    replacePose(component, pose);
    output[avatarPart] = component;
  }
  for (const [part, pose] of Object.entries(target)) {
    const avatarPart = part as AvatarPart;
    const component = output[avatarPart] ?? {};
    mergePose(component, pose);
    output[avatarPart] = component;
  }
  return output;
}

const POSE_PROPERTIES = [
  'x', 'y', 'rotation', 'scaleX', 'scaleY', 'opacity',
] as const satisfies readonly (keyof AvatarPose)[];

function replacePose(current: AvatarPose, replacement: AvatarPose): void {
  for (const property of POSE_PROPERTIES) {
    if (property in replacement) current[property] = replacement[property];
    else delete current[property];
  }
}

function mergePose(current: AvatarPose, addition: AvatarPose): void {
  for (const property of POSE_PROPERTIES) {
    if (property in addition) current[property] = addition[property];
  }
}
