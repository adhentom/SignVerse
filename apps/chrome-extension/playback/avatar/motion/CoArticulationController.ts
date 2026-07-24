import type { AvatarPoseSnapshot } from '../../types';
import type { AvatarPart } from '../AvatarAnimationEngine';
import { interpolateAngle } from '../controllers/AnimationController';
import { MotionPlanner } from './MotionPlanner';
import { resolveMotionProfile } from './motionProfiles';
import { sharedTrajectoryGenerator, TrajectoryGenerator } from './TrajectoryGenerator';
import type {
  MotionPlan,
  MotionPose,
  MotionProfile,
  MotionQualityDiagnostics,
  TrajectorySmoothingStatistics,
} from './types';

type Mode = 'idle' | 'transition' | 'idle-recovery';

export interface CoArticulationOptions {
  planner?: MotionPlanner;
  trajectories?: TrajectoryGenerator;
  profile?: string;
  reducedMotion?: boolean;
}

export class CoArticulationController {
  private readonly planner: MotionPlanner;
  private readonly trajectories: TrajectoryGenerator;
  private profile: MotionProfile;
  private reducedMotion: boolean;
  private requestedDurationMs?: number;
  private availableDurationMs?: number;
  private transitionHint?: string;
  private source?: AvatarPoseSnapshot;
  private fixedTarget?: MotionPose;
  private trajectory?: ReturnType<TrajectoryGenerator['generate']>;
  private plan?: MotionPlan;
  private lastPlan?: MotionPlan;
  private animationId = 'idle';
  private previousAnimationId?: string;
  private elapsedMs = 0;
  private mode: Mode = 'idle';
  private totalFrames = 0;
  private activeFrames = 0;
  private transitionCount = 0;
  private repeatedTransitions = 0;
  private totalTransitionDurationMs = 0;
  private readonly trajectoryStatistics: TrajectorySmoothingStatistics = {
    cacheHits: 0,
    cacheMisses: 0,
    cacheEvictions: 0,
    generatedTrajectories: 0,
    sampledFrames: 0,
    smoothedJoints: 0,
  };

  constructor(options: CoArticulationOptions = {}) {
    this.planner = options.planner ?? new MotionPlanner();
    this.trajectories = options.trajectories ?? sharedTrajectoryGenerator;
    this.profile = resolveMotionProfile(options.profile);
    this.reducedMotion = options.reducedMotion ?? false;
  }

  configure(
    requestedDurationMs: number | undefined,
    availableDurationMs: number | undefined,
    reducedMotion: boolean,
    profile?: string,
    transitionHint?: string,
  ): void {
    this.requestedDurationMs = requestedDurationMs;
    this.availableDurationMs = availableDurationMs;
    this.reducedMotion = reducedMotion;
    this.profile = resolveMotionProfile(profile ?? this.profile.id);
    this.transitionHint = transitionHint;
  }

  beginTransition(
    source: AvatarPoseSnapshot,
    animationId: string,
    previousAnimationId?: string,
  ): void {
    if (previousAnimationId) this.previousAnimationId = previousAnimationId;
    else if (this.mode === 'transition') this.previousAnimationId = this.animationId;
    this.source = clonePose(source);
    this.fixedTarget = undefined;
    this.trajectory = undefined;
    this.plan = undefined;
    this.animationId = animationId;
    this.elapsedMs = 0;
    this.mode = Object.keys(source).length > 0 && !this.reducedMotion ? 'transition' : 'idle';
  }

  beginIdleRecovery(source: AvatarPoseSnapshot, neutral: AvatarPoseSnapshot): void {
    this.source = clonePose(source);
    this.fixedTarget = clonePose(neutral);
    this.trajectory = undefined;
    this.plan = undefined;
    this.animationId = 'idle-recovery';
    this.elapsedMs = 0;
    this.mode = Object.keys(source).length > 0 && !this.reducedMotion
      ? 'idle-recovery'
      : 'idle';
  }

  cancel(): void {
    this.finish();
  }

  advance(elapsedMs: number): void {
    if (this.mode === 'idle') return;
    this.elapsedMs += Math.max(0, elapsedMs);
  }

  apply(target: MotionPose): MotionPose {
    this.totalFrames += 1;
    if (this.mode === 'idle' || !this.source) return target;
    const effectiveTarget = this.fixedTarget ?? target;
    if (!this.plan || !this.trajectory) this.initialize(effectiveTarget);
    if (!this.plan || !this.trajectory || this.plan.durationMs === 0) {
      this.finish();
      return effectiveTarget;
    }
    this.activeFrames += 1;
    const progress = clamp(this.elapsedMs / this.plan.durationMs, 0, 1);
    const planned = this.trajectory.sample(progress);
    this.trajectoryStatistics.sampledFrames += 1;
    const catchUp = this.mode === 'transition'
      ? smootherStep(clamp((progress - 0.62) / 0.38, 0, 1))
      : 0;
    const result = catchUp > 0 ? blendPoses(planned, target, catchUp) : planned;
    if (progress >= 1) {
      const completedMode = this.mode;
      this.finish();
      return completedMode === 'transition' ? target : effectiveTarget;
    }
    return result;
  }

  diagnostics(): MotionQualityDiagnostics {
    const diagnosticPlan = this.plan ?? this.lastPlan;
    return Object.freeze({
      transitionQuality: diagnosticPlan?.transitionQuality ?? 1,
      pathLength: diagnosticPlan?.pathLength ?? 0,
      blendUtilization: this.totalFrames === 0 ? 0 : this.activeFrames / this.totalFrames,
      averageTransitionDurationMs: this.transitionCount === 0
        ? 0
        : this.totalTransitionDurationMs / this.transitionCount,
      coArticulationUsage: this.transitionCount,
      repeatedSignTransitions: this.repeatedTransitions,
      wristFingerSamples: 0,
      activeCoArticulation: this.active,
      activeMotionProfile: this.profile.id,
      activeTransitionProfile: diagnosticPlan?.transitionProfile ?? 'default',
      trajectorySmoothing: Object.freeze({ ...this.trajectoryStatistics }),
    });
  }

  dispose(): void {
    this.finish();
  }

  get active(): boolean { return this.mode !== 'idle'; }
  get returningToIdle(): boolean { return this.mode === 'idle-recovery'; }
  get configuredDurationMs(): number {
    return this.plan?.durationMs ??
      (Number.isFinite(this.requestedDurationMs) ? Math.max(0, this.requestedDurationMs!) : 0);
  }

  private initialize(target: MotionPose): void {
    this.plan = this.planner.plan({
      source: this.source ?? {},
      target,
      animationId: this.animationId,
      previousAnimationId: this.previousAnimationId,
      requestedDurationMs: this.requestedDurationMs,
      availableDurationMs: this.availableDurationMs,
      transitionHint: this.transitionHint,
      profile: this.profile,
      reducedMotion: this.reducedMotion,
    });
    this.trajectory = this.trajectories.generate(this.source ?? {}, target, this.plan);
    if (this.trajectory.cacheHit) this.trajectoryStatistics.cacheHits += 1;
    else {
      this.trajectoryStatistics.cacheMisses += 1;
      this.trajectoryStatistics.generatedTrajectories += 1;
    }
    this.trajectoryStatistics.cacheEvictions += this.trajectory.cacheEvictions;
    this.trajectoryStatistics.smoothedJoints += this.trajectory.smoothedJoints;
    this.transitionCount += 1;
    this.totalTransitionDurationMs += this.plan.durationMs;
    if (this.plan.repeatedSign) this.repeatedTransitions += 1;
  }

  private finish(): void {
    if (this.mode === 'transition') this.previousAnimationId = this.animationId;
    if (this.plan) this.lastPlan = this.plan;
    this.source = undefined;
    this.fixedTarget = undefined;
    this.trajectory = undefined;
    this.plan = undefined;
    this.elapsedMs = 0;
    this.mode = 'idle';
  }
}

function blendPoses(from: MotionPose, to: MotionPose, progress: number): MotionPose {
  const result: MotionPose = {};
  const parts = new Set([...Object.keys(from), ...Object.keys(to)] as AvatarPart[]);
  for (const part of parts) {
    const start = from[part] ?? {};
    const finish = to[part] ?? start;
    result[part] = {
      rotation: interpolateAngle(start.rotation, finish.rotation, progress),
      x: interpolateOptional(start.x, finish.x, progress),
      y: interpolateOptional(start.y, finish.y, progress),
      scaleX: interpolateOptional(start.scaleX, finish.scaleX, progress),
      scaleY: interpolateOptional(start.scaleY, finish.scaleY, progress),
      opacity: interpolateOptional(start.opacity, finish.opacity, progress),
    };
  }
  return result;
}

function clonePose(pose: AvatarPoseSnapshot): AvatarPoseSnapshot {
  return Object.fromEntries(
    Object.entries(pose).map(([part, value]) => [part, { ...value }]),
  );
}

function interpolate(from: number | undefined, to: number | undefined, progress: number): number {
  const start = from ?? to ?? 0;
  return start + ((to ?? start) - start) * progress;
}

function interpolateOptional(
  from: number | undefined,
  to: number | undefined,
  progress: number,
): number | undefined {
  if (from === undefined && to === undefined) return undefined;
  return interpolate(from, to, progress);
}

function smootherStep(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
