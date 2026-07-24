import type { NonManualMarker } from '../../../shared/interpretation';
import type { AvatarPart, AvatarPose } from '../AvatarAnimationEngine';
import type { SignVerseSkeletalRig } from '../signVerseInterpreter/SignVerseSkeletalRig';
import {
  resolveSignVerseExpression,
  signVerseExpressionPose,
  type SignVerseExpression,
} from '../signVerseInterpreter/expressionSystem';

type Pose = Partial<Record<AvatarPart, AvatarPose>>;

export class ExpressionController {
  private markers: readonly NonManualMarker[] = [];
  private expression: SignVerseExpression = 'neutral';

  setMarkers(markers: readonly NonManualMarker[]): void {
    this.markers = Object.freeze([...markers]);
    this.expression = resolveSignVerseExpression(this.markers);
  }

  reset(): void {
    this.markers = [];
    this.expression = 'neutral';
  }

  apply(rig: SignVerseSkeletalRig, pose: Pose, time: number): void {
    rig.setFacialExpression(this.expression);
    mergePose(pose, signVerseExpressionPose(this.expression));
    const oscillation = Math.sin(time / 105);
    for (const marker of this.markers) {
      const weight = Math.max(0, Math.min(1, marker.intensity));
      switch (marker.marker) {
        case 'brow-raise': mergePart(pose, 'eyebrows', { y: -4 * weight }); break;
        case 'brow-lower': mergePart(pose, 'eyebrows', { y: 3 * weight, scaleY: 0.82 }); break;
        case 'head-shake': mergePart(pose, 'head', { rotation: oscillation * 9 * weight }); break;
        case 'head-nod': mergePart(pose, 'neck', { rotation: oscillation * 5 * weight }); break;
        case 'head-tilt': mergePart(pose, 'head', { rotation: 8 * weight }); break;
        case 'eye-gaze': this.applyGaze(rig, marker.value, weight); break;
        case 'mouth-gesture': mergePart(pose, 'mouth', { scaleY: 1 + 0.8 * weight }); break;
        case 'body-shift': mergePart(pose, 'torso', { rotation: oscillation * 3 * weight }); break;
        case 'facial-emotion': break;
      }
    }
  }

  private applyGaze(rig: SignVerseSkeletalRig, value: string, weight: number): void {
    const direction = value.toLocaleLowerCase('en');
    rig.setGaze(
      direction.includes('left') ? -3 * weight : direction.includes('right') ? 3 * weight : 0,
      direction.includes('up') ? -2 * weight : direction.includes('down') ? 2 * weight : 0,
    );
  }
}

function mergePose(target: Pose, addition: Pose): void {
  for (const [key, value] of Object.entries(addition)) {
    if (value) mergePart(target, key as AvatarPart, value);
  }
}

function mergePart(target: Pose, part: AvatarPart, addition: AvatarPose): void {
  const current = target[part] ?? {};
  target[part] = {
    ...current,
    ...addition,
    rotation: (current.rotation ?? 0) + (addition.rotation ?? 0),
  };
}
