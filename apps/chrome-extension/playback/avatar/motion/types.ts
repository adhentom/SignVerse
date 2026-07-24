import type { AvatarPart, AvatarPose } from '../AvatarAnimationEngine';
import type { AvatarPoseSnapshot } from '../../types';

export type MotionProfileId = 'precise' | 'conversational' | 'expressive' | 'educational';
export type MotionTransitionProfile = 'default' | 'fast' | 'slow' | 'directional' | 'emphasis';
export type MotionPose = Partial<Record<AvatarPart, AvatarPose>>;

export interface MotionProfile {
  id: MotionProfileId;
  baseTransitionMs: number;
  minimumTransitionMs: number;
  maximumTransitionMs: number;
  curvature: number;
  velocitySmoothing: number;
  anticipation: number;
  followThrough: number;
  repeatedSignScale: number;
  secondaryMotionScale: number;
}

export interface MotionPlanInput {
  source: AvatarPoseSnapshot;
  target: MotionPose;
  animationId: string;
  previousAnimationId?: string;
  requestedDurationMs?: number;
  availableDurationMs?: number;
  transitionHint?: string;
  profile: MotionProfile;
  reducedMotion: boolean;
}

export interface MotionPlan {
  animationId: string;
  profile: MotionProfile;
  transitionProfile: MotionTransitionProfile;
  durationMs: number;
  pathLength: number;
  repeatedSign: boolean;
  abruptDirectionChanges: number;
  transitionQuality: number;
}

export interface TrajectorySmoothingStatistics {
  cacheHits: number;
  cacheMisses: number;
  cacheEvictions: number;
  generatedTrajectories: number;
  sampledFrames: number;
  smoothedJoints: number;
}

export interface MotionQualityDiagnostics {
  transitionQuality: number;
  pathLength: number;
  blendUtilization: number;
  averageTransitionDurationMs: number;
  coArticulationUsage: number;
  repeatedSignTransitions: number;
  wristFingerSamples: number;
  activeCoArticulation: boolean;
  activeMotionProfile: MotionProfileId;
  activeTransitionProfile: MotionTransitionProfile;
  trajectorySmoothing: TrajectorySmoothingStatistics;
}
