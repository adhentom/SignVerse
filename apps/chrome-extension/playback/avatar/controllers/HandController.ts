import type { AvatarPart, AvatarPose } from '../AvatarAnimationEngine';
import {
  isSignVerseHandShape,
  signVerseHandShapePose,
  type SignVerseHandShape,
} from '../signVerseInterpreter/handShapeLibrary';

type Side = 'left' | 'right';
type Pose = Partial<Record<AvatarPart, AvatarPose>>;
type HandShapeEntry = readonly [AvatarPart, AvatarPose];

export class HandController {
  private readonly shapes: Partial<Record<Side, SignVerseHandShape>> = {};
  private readonly entries: Partial<Record<Side, readonly HandShapeEntry[]>> = {};

  setShape(side: Side, shapeId: string): boolean {
    if (!isSignVerseHandShape(shapeId)) return false;
    const shape = shapeId.trim().toLocaleLowerCase('en') as SignVerseHandShape;
    if (this.shapes[side] === shape) return true;
    this.shapes[side] = shape;
    this.entries[side] = Object.freeze(
      Object.entries(signVerseHandShapePose(side, shape))
        .map(([part, value]) => Object.freeze([
          part as AvatarPart,
          Object.freeze({ ...value }),
        ] as const)),
    );
    return true;
  }

  apply(pose: Pose): void {
    for (const side of ['left', 'right'] as const) {
      const entries = this.entries[side];
      if (!entries) continue;
      for (const [avatarPart, value] of entries) {
        // Approved clip articulation is authoritative. The reusable handshape
        // fills only joints that the clip did not define.
        if (pose[avatarPart]?.rotation === undefined) pose[avatarPart] = value;
      }
    }
  }

  shape(side: Side): SignVerseHandShape | undefined {
    return this.shapes[side];
  }
}
