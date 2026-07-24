import type { NonManualMarker } from '../../../shared/interpretation';
import type { AvatarPart, AvatarPose } from '../AvatarAnimationEngine';

export type SignVerseExpression =
  | 'neutral' | 'smile' | 'question' | 'emphasis' | 'surprise'
  | 'negation' | 'concentration' | 'sadness';

const POSES: Record<SignVerseExpression, Partial<Record<AvatarPart, AvatarPose>>> = {
  neutral: {},
  smile: { eyebrows: { y: -1 }, eyes: { scaleY: 0.96 }, mouth: { scaleX: 1.08, scaleY: 1.06 } },
  question: { eyebrows: { y: -5 }, eyes: { scaleY: 1.08 }, head: { rotation: 3 } },
  emphasis: { eyebrows: { y: 3, scaleY: 0.8 }, eyes: { scaleY: 0.9 }, torso: { rotation: 1.5 } },
  surprise: { eyebrows: { y: -6 }, eyes: { scaleX: 1.08, scaleY: 1.18 }, jaw: { scaleY: 1.5 } },
  negation: { eyebrows: { y: 2.5, scaleY: 0.84 }, mouth: { scaleX: 0.92 } },
  concentration: { eyebrows: { y: 2, rotation: -3 }, eyes: { scaleY: 0.91 } },
  sadness: { eyebrows: { y: 3, rotation: -5 }, mouth: { scaleX: 0.93 } },
};

export function signVerseExpressionPose(
  expression: SignVerseExpression,
): Partial<Record<AvatarPart, AvatarPose>> {
  return POSES[expression];
}

export function resolveSignVerseExpression(
  markers: readonly NonManualMarker[],
): SignVerseExpression {
  const emotion = markers.find(({ marker }) => marker === 'facial-emotion')?.value.toLowerCase();
  if (emotion?.includes('happy') || emotion?.includes('smile') || emotion?.includes('joy')) return 'smile';
  if (emotion?.includes('surprise')) return 'surprise';
  if (emotion?.includes('sad')) return 'sadness';
  if (emotion?.includes('concentrat') || emotion?.includes('focus')) return 'concentration';
  if (markers.some(({ marker }) => marker === 'head-shake')) return 'negation';
  if (markers.some(({ marker }) => marker === 'brow-raise')) return 'question';
  if (markers.some(({ marker }) => marker === 'brow-lower')) return 'emphasis';
  return 'neutral';
}
