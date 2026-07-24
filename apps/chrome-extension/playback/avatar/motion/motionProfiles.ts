import type {
  MotionProfile,
  MotionProfileId,
  MotionTransitionProfile,
} from './types';

export const MOTION_PROFILES: Readonly<Record<MotionProfileId, MotionProfile>> = Object.freeze({
  precise: Object.freeze({
    id: 'precise',
    baseTransitionMs: 180,
    minimumTransitionMs: 110,
    maximumTransitionMs: 320,
    curvature: 0.12,
    velocitySmoothing: 0.88,
    anticipation: 0.08,
    followThrough: 0.06,
    repeatedSignScale: 0.7,
    secondaryMotionScale: 0.65,
  }),
  conversational: Object.freeze({
    id: 'conversational',
    baseTransitionMs: 145,
    minimumTransitionMs: 85,
    maximumTransitionMs: 260,
    curvature: 0.18,
    velocitySmoothing: 0.8,
    anticipation: 0.12,
    followThrough: 0.1,
    repeatedSignScale: 0.58,
    secondaryMotionScale: 0.85,
  }),
  expressive: Object.freeze({
    id: 'expressive',
    baseTransitionMs: 205,
    minimumTransitionMs: 120,
    maximumTransitionMs: 360,
    curvature: 0.24,
    velocitySmoothing: 0.76,
    anticipation: 0.16,
    followThrough: 0.14,
    repeatedSignScale: 0.68,
    secondaryMotionScale: 1,
  }),
  educational: Object.freeze({
    id: 'educational',
    baseTransitionMs: 245,
    minimumTransitionMs: 150,
    maximumTransitionMs: 420,
    curvature: 0.1,
    velocitySmoothing: 0.92,
    anticipation: 0.06,
    followThrough: 0.05,
    repeatedSignScale: 0.78,
    secondaryMotionScale: 0.55,
  }),
});

const PROFILE_ALIASES: Readonly<Record<string, MotionProfileId>> = Object.freeze({
  precise: 'precise',
  default: 'precise',
  reviewed: 'precise',
  conversational: 'conversational',
  fast: 'conversational',
  directional: 'conversational',
  expressive: 'expressive',
  emphasis: 'expressive',
  educational: 'educational',
  slow: 'educational',
});

export function resolveMotionProfile(value: unknown): MotionProfile {
  const key = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return MOTION_PROFILES[PROFILE_ALIASES[key] ?? 'precise'];
}

export function resolveTransitionProfile(value: unknown): MotionTransitionProfile {
  const key = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (key === 'fast' || key === 'slow' || key === 'directional' || key === 'emphasis') {
    return key;
  }
  return 'default';
}
