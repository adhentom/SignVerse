export const SIGNVERSE_INTERPRETER_RIG_VERSION = '6.0';

export const SIGNVERSE_INTERPRETER_GEOMETRY = {
  viewBox: '0 0 600 700',
  rootPivot: [300, 660] as const,
  torsoPivot: [300, 455] as const,
  clavicleCenter: [300, 265] as const,
  clavicleLength: 138,
  shoulders: {
    left: [162, 265] as const,
    right: [438, 265] as const,
  },
  hips: {
    left: [240, 625] as const,
    right: [360, 625] as const,
  },
  upperArmLength: 118,
  forearmLength: 112,
} as const;

export const SIGNVERSE_ARM_BIND_ROTATION = {
  left: 106,
  right: 74,
} as const;
