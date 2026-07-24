import type { AvatarPart, AvatarPose } from '../AvatarAnimationEngine';

export const SIGNVERSE_HAND_SHAPES = [
  'relaxed', 'open', 'flat', 'fist', 'point', 'curved', 'pinch', 'spread',
  'index', 'thumb-up',
] as const;

export type SignVerseHandShape = typeof SIGNVERSE_HAND_SHAPES[number];
type Side = 'left' | 'right';
type Finger = 'index' | 'middle' | 'ring' | 'little';
type FingerAngles = readonly [number, number, number];
type ThumbAngles = readonly [number, number, number, number];

interface HandShapeDefinition {
  thumb: ThumbAngles;
  fingers: Record<Finger, FingerAngles>;
}

const SHAPES: Record<SignVerseHandShape, HandShapeDefinition> = {
  relaxed: {
    thumb: [25, 12, 5, 3],
    fingers: { index: [-3, 8, 4], middle: [-1, 7, 4], ring: [2, 9, 5], little: [5, 12, 7] },
  },
  open: {
    thumb: [30, 20, 0, 0],
    fingers: { index: [-11, 0, 0], middle: [-4, 0, 0], ring: [4, 0, 0], little: [12, 0, 0] },
  },
  flat: {
    thumb: [15, 14, 5, 3],
    fingers: { index: [-7, 0, 0], middle: [-3, 0, 0], ring: [1, 0, 0], little: [5, 0, 0] },
  },
  spread: {
    thumb: [40, 31, 0, 0],
    fingers: { index: [-26, 0, 0], middle: [-8, 0, 0], ring: [10, 0, 0], little: [28, 0, 0] },
  },
  fist: {
    thumb: [-10, 28, 32, 18],
    fingers: { index: [-5, 104, 76], middle: [-1, 108, 78], ring: [3, 110, 80], little: [8, 106, 78] },
  },
  point: {
    thumb: [4, 22, 28, 16],
    fingers: { index: [-6, 2, 1], middle: [-1, 106, 76], ring: [3, 109, 78], little: [8, 106, 76] },
  },
  index: {
    thumb: [7, 24, 26, 15],
    fingers: { index: [-6, 0, 0], middle: [-1, 106, 76], ring: [3, 109, 78], little: [8, 106, 76] },
  },
  curved: {
    thumb: [22, 28, 28, 18],
    fingers: { index: [-12, 31, 25], middle: [-5, 36, 29], ring: [3, 40, 33], little: [11, 44, 36] },
  },
  pinch: {
    thumb: [-50, 50, 20, 20],
    fingers: { index: [30, 20, 30], middle: [-1, 104, 74], ring: [3, 108, 77], little: [8, 106, 76] },
  },
  'thumb-up': {
    thumb: [105, 5, 0, 0],
    fingers: { index: [-4, 105, 76], middle: [0, 108, 78], ring: [4, 110, 80], little: [9, 107, 78] },
  },
};

export function isSignVerseHandShape(value: string): value is SignVerseHandShape {
  return (SIGNVERSE_HAND_SHAPES as readonly string[]).includes(value.trim().toLowerCase());
}

export function signVerseHandShapePose(
  side: Side,
  shape: SignVerseHandShape,
): Partial<Record<AvatarPart, AvatarPose>> {
  const pose: Partial<Record<AvatarPart, AvatarPose>> = {};
  const definition = SHAPES[shape];
  const [cmc, thumbMcp, thumbPip, thumbDip] = definition.thumb;
  pose[`${side}-thumb-cmc` as AvatarPart] = { rotation: cmc };
  pose[`${side}-thumb-mcp` as AvatarPart] = { rotation: thumbMcp };
  pose[`${side}-thumb-pip` as AvatarPart] = { rotation: thumbPip };
  pose[`${side}-thumb-dip` as AvatarPart] = { rotation: thumbDip };

  Object.entries(definition.fingers).forEach(([finger, [mcp, pip, dip]]) => {
    pose[`${side}-${finger}-mcp` as AvatarPart] = { rotation: mcp };
    pose[`${side}-${finger}-pip` as AvatarPart] = { rotation: pip };
    pose[`${side}-${finger}-dip` as AvatarPart] = { rotation: dip };
  });
  return pose;
}
