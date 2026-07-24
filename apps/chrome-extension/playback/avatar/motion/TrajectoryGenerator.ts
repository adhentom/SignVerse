import type { AvatarPoseSnapshot } from '../../types';
import type { AvatarPart, AvatarPose } from '../AvatarAnimationEngine';
import { interpolateAngle } from '../controllers/AnimationController';
import type {
  MotionPlan,
  MotionPose,
  TrajectorySmoothingStatistics,
} from './types';

interface JointTrajectory {
  part: AvatarPart;
  start: AvatarPose;
  finish: AvatarPose;
  rotationStart: number;
  rotationDelta: number;
  rotationControlOne: number;
  rotationControlTwo: number;
}

export interface GeneratedTrajectory {
  readonly pathLength: number;
  readonly smoothedJoints: number;
  readonly cacheHit: boolean;
  readonly cacheEvictions: number;
  sample(progress: number, output?: MotionPose): MotionPose;
}

export class TrajectoryGenerator {
  private readonly cache = new Map<string, GeneratedTrajectory>();
  private cacheHits = 0;
  private cacheMisses = 0;
  private cacheEvictions = 0;
  private generatedTrajectories = 0;
  private sampledFrames = 0;
  private smoothedJoints = 0;

  constructor(private readonly capacity = 64) {}

  generate(
    source: AvatarPoseSnapshot,
    target: MotionPose,
    plan: MotionPlan,
  ): GeneratedTrajectory {
    const key = trajectoryKey(source, target, plan);
    const existing = this.cache.get(key);
    if (existing) {
      this.cacheHits += 1;
      this.cache.delete(key);
      this.cache.set(key, existing);
      return this.instrument(existing, true, 0);
    }
    this.cacheMisses += 1;
    const created = createTrajectory(source, target, plan);
    this.generatedTrajectories += 1;
    this.smoothedJoints += created.smoothedJoints;
    this.cache.set(key, created);
    let evictions = 0;
    while (this.cache.size > Math.max(1, this.capacity)) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
      this.cacheEvictions += 1;
      evictions += 1;
    }
    return this.instrument(created, false, evictions);
  }

  statistics(): TrajectorySmoothingStatistics {
    return Object.freeze({
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      cacheEvictions: this.cacheEvictions,
      generatedTrajectories: this.generatedTrajectories,
      sampledFrames: this.sampledFrames,
      smoothedJoints: this.smoothedJoints,
    });
  }

  clear(): void {
    this.cache.clear();
  }

  private instrument(
    trajectory: GeneratedTrajectory,
    cacheHit: boolean,
    cacheEvictions: number,
  ): GeneratedTrajectory {
    const output: MotionPose = {};
    return {
      pathLength: trajectory.pathLength,
      smoothedJoints: trajectory.smoothedJoints,
      cacheHit,
      cacheEvictions,
      sample: (progress) => {
        this.sampledFrames += 1;
        return trajectory.sample(progress, output);
      },
    };
  }
}

export const sharedTrajectoryGenerator = new TrajectoryGenerator(128);

function createTrajectory(
  source: AvatarPoseSnapshot,
  target: MotionPose,
  plan: MotionPlan,
): GeneratedTrajectory {
  const parts = new Set([...Object.keys(source), ...Object.keys(target)] as AvatarPart[]);
  const joints: JointTrajectory[] = [];
  for (const part of parts) {
    const start = source[part] ?? {};
    const finish = target[part] ?? start;
    const rotationStart = start.rotation ?? finish.rotation ?? 0;
    const finalRotation = finish.rotation ?? rotationStart;
    const shortestFinish = interpolateAngle(rotationStart, finalRotation, 1);
    const rotationDelta = shortestFinish - rotationStart;
    const rotationCurve = curveFor(part, rotationDelta, plan);
    joints.push({
      part,
      start: { ...start },
      finish: { ...finish },
      rotationStart,
      rotationDelta,
      rotationControlOne: rotationStart +
        rotationDelta * (0.24 - plan.profile.anticipation * 0.2) +
        rotationCurve,
      rotationControlTwo: rotationStart +
        rotationDelta * (0.76 + plan.profile.followThrough * 0.16) -
        rotationCurve,
    });
  }
  return Object.freeze({
    pathLength: plan.pathLength,
    smoothedJoints: joints.length,
    cacheHit: false,
    cacheEvictions: 0,
    sample: (progress: number, output?: MotionPose) =>
      sampleTrajectory(joints, progress, plan, output),
  });
}

function sampleTrajectory(
  joints: JointTrajectory[],
  progress: number,
  plan: MotionPlan,
  output: MotionPose = {},
): MotionPose {
  const time = easedProgress(clamp(progress, 0, 1), plan);
  for (const joint of joints) {
    const component = output[joint.part] ?? {};
    component.rotation = cubicBezier(
      joint.rotationStart,
      joint.rotationControlOne,
      joint.rotationControlTwo,
      joint.rotationStart + joint.rotationDelta,
      time,
    );
    assignOptional(component, 'x', interpolateOptional(joint.start.x, joint.finish.x, time));
    assignOptional(component, 'y', interpolateOptional(joint.start.y, joint.finish.y, time));
    assignOptional(
      component,
      'scaleX',
      interpolateOptional(joint.start.scaleX, joint.finish.scaleX, time),
    );
    assignOptional(
      component,
      'scaleY',
      interpolateOptional(joint.start.scaleY, joint.finish.scaleY, time),
    );
    assignOptional(
      component,
      'opacity',
      interpolateOptional(joint.start.opacity, joint.finish.opacity, time),
    );
    output[joint.part] = component;
  }
  return output;
}

function assignOptional(
  pose: AvatarPose,
  property: 'x' | 'y' | 'scaleX' | 'scaleY' | 'opacity',
  value: number | undefined,
): void {
  if (value === undefined) delete pose[property];
  else pose[property] = value;
}

function easedProgress(progress: number, plan: MotionPlan): number {
  switch (plan.transitionProfile) {
    case 'fast':
      return smootherStep(Math.min(1, progress * 1.12));
    case 'slow':
      return smootherStep(progress) ** 1.12;
    case 'directional':
      return progress * progress * (3 - 2 * progress);
    case 'emphasis':
      return clamp(smootherStep(progress) + Math.sin(Math.PI * progress) * 0.055, 0, 1);
    case 'default':
      return smootherStep(progress);
  }
}

function curveFor(part: AvatarPart, delta: number, plan: MotionPlan): number {
  const direction = part.startsWith('left-') ? -1 : 1;
  const repeatedRelease = plan.repeatedSign && (
    part.includes('hand') ||
    part.includes('forearm') ||
    /(?:thumb|index|middle|ring|little)/u.test(part)
  );
  const magnitude = Math.min(
    16,
    Math.max(repeatedRelease ? 6 * plan.profile.followThrough : 0, Math.abs(delta) * plan.profile.curvature),
  );
  if (/(?:thumb|index|middle|ring|little)/u.test(part)) {
    return direction * magnitude * 0.16;
  }
  if (part.includes('hand')) return direction * magnitude * 0.5;
  if (part.includes('forearm') || part.includes('upper-arm')) return direction * magnitude;
  return magnitude * 0.2;
}

function trajectoryKey(
  source: AvatarPoseSnapshot,
  target: MotionPose,
  plan: MotionPlan,
): string {
  return [
    plan.animationId,
    plan.profile.id,
    plan.transitionProfile,
    plan.repeatedSign ? 'repeat' : 'new',
    poseSignature(source),
    poseSignature(target),
  ].join('|');
}

function poseSignature(pose: AvatarPoseSnapshot | MotionPose): string {
  return Object.entries(pose)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([part, value]) => [
      part,
      encodePoseValue(value.rotation),
      encodePoseValue(value.x),
      encodePoseValue(value.y),
      encodePoseValue(value.scaleX),
      encodePoseValue(value.scaleY),
      encodePoseValue(value.opacity),
    ].join(':'))
    .join(',');
}

function encodePoseValue(value: number | undefined): string {
  if (value === undefined) return 'unset';
  if (Number.isNaN(value)) return 'nan';
  if (value === Number.POSITIVE_INFINITY) return 'infinity';
  if (value === Number.NEGATIVE_INFINITY) return '-infinity';
  return Object.is(value, -0) ? '-0' : String(value);
}

function smootherStep(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function cubicBezier(start: number, c1: number, c2: number, end: number, time: number): number {
  const inverse = 1 - time;
  return inverse ** 3 * start +
    3 * inverse ** 2 * time * c1 +
    3 * inverse * time ** 2 * c2 +
    time ** 3 * end;
}

function interpolateOptional(
  from: number | undefined,
  to: number | undefined,
  time: number,
): number | undefined {
  if (from === undefined && to === undefined) return undefined;
  const start = from ?? to ?? 0;
  return start + ((to ?? start) - start) * time;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
