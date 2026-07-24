import type { AvatarPart, AvatarPose } from '../AvatarAnimationEngine';
import type { AvatarPoseSnapshot } from '../../types';
import type { SignVerseExpression } from './expressionSystem';
import {
  SIGNVERSE_ARM_BIND_ROTATION,
  SIGNVERSE_INTERPRETER_GEOMETRY,
} from './interpreterGeometry';

interface BoneDefinition {
  parent: AvatarPart;
  restRotation: number;
  minimum: number;
  maximum: number;
  pivot?: readonly [number, number];
  continuous?: boolean;
}

const FINGER_REST = {
  index: [-3, 8, 4],
  middle: [-1, 7, 4],
  ring: [2, 9, 5],
  little: [5, 12, 7],
} as const;

const FINGER_BONES = Object.fromEntries(
  (['left', 'right'] as const).flatMap((side) => (
    Object.entries(FINGER_REST).flatMap(([finger, [mcp, pip, dip]]) => {
      const mcpPart = `${side}-${finger}-mcp` as AvatarPart;
      const pipPart = `${side}-${finger}-pip` as AvatarPart;
      const dipPart = `${side}-${finger}-dip` as AvatarPart;
      return [
        [mcpPart, { parent: `${side}-hand`, restRotation: mcp, minimum: -35, maximum: 35 }],
        [pipPart, { parent: mcpPart, restRotation: pip, minimum: -8, maximum: 110 }],
        [dipPart, { parent: pipPart, restRotation: dip, minimum: -12, maximum: 95 }],
      ];
    })
  )),
) as Partial<Record<AvatarPart, BoneDefinition>>;

const THUMB_BONES = Object.fromEntries(
  (['left', 'right'] as const).flatMap((side) => {
    const cmc = `${side}-thumb-cmc` as AvatarPart;
    const mcp = `${side}-thumb-mcp` as AvatarPart;
    const pip = `${side}-thumb-pip` as AvatarPart;
    const dip = `${side}-thumb-dip` as AvatarPart;
    return [
      [cmc, { parent: `${side}-hand`, restRotation: 25, minimum: -65, maximum: 105 }],
      [mcp, { parent: cmc, restRotation: 12, minimum: -20, maximum: 85 }],
      [pip, { parent: mcp, restRotation: 5, minimum: -12, maximum: 90 }],
      [dip, { parent: pip, restRotation: 3, minimum: -15, maximum: 75 }],
    ];
  }),
) as Partial<Record<AvatarPart, BoneDefinition>>;

const BONES: Partial<Record<AvatarPart, BoneDefinition>> = {
  pelvis: { parent: 'body', restRotation: 0, minimum: -5, maximum: 5, pivot: [300, 625] },
  torso: {
    parent: 'body', restRotation: 0, minimum: -10, maximum: 10,
    pivot: SIGNVERSE_INTERPRETER_GEOMETRY.torsoPivot,
  },
  neck: { parent: 'torso', restRotation: 0, minimum: -18, maximum: 18 },
  head: { parent: 'neck', restRotation: 0, minimum: -22, maximum: 22 },
  'left-clavicle': { parent: 'torso', restRotation: 0, minimum: -12, maximum: 12 },
  'right-clavicle': { parent: 'torso', restRotation: 0, minimum: -12, maximum: 12 },
  'left-upper-arm': {
    parent: 'left-clavicle', restRotation: SIGNVERSE_ARM_BIND_ROTATION.left,
    minimum: -360, maximum: 360, continuous: true,
  },
  'left-forearm': { parent: 'left-upper-arm', restRotation: 0, minimum: -155, maximum: 155 },
  'left-hand': { parent: 'left-forearm', restRotation: 0, minimum: -100, maximum: 100 },
  'right-upper-arm': {
    parent: 'right-clavicle', restRotation: SIGNVERSE_ARM_BIND_ROTATION.right,
    minimum: -360, maximum: 360, continuous: true,
  },
  'right-forearm': { parent: 'right-upper-arm', restRotation: 0, minimum: -155, maximum: 155 },
  'right-hand': { parent: 'right-forearm', restRotation: 0, minimum: -100, maximum: 100 },
  'left-thigh': { parent: 'pelvis', restRotation: 0, minimum: -12, maximum: 12 },
  'right-thigh': { parent: 'pelvis', restRotation: 0, minimum: -12, maximum: 12 },
  ...THUMB_BONES,
  ...FINGER_BONES,
};

const JOINT_PARTS = Object.keys(BONES) as AvatarPart[];
const FACIAL_PARTS = new Set<AvatarPart>([
  'eyes', 'left-eye', 'right-eye', 'eyebrows', 'left-eyebrow', 'right-eyebrow',
  'mouth', 'jaw', 'nose',
]);

const HAND_PARTS = ['left-hand', 'right-hand'] as const;
// A three-quarter inward turn keeps the resting hands natural without hiding
// the palm or collapsing the articulated fingers into a blade-like silhouette.
const NEUTRAL_HAND_PROJECTION = 0.78;

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.max(minimum, Math.min(maximum, value))
);
const finite = (value: number | undefined, fallback: number) => (
  value !== undefined && Number.isFinite(value) ? value : fallback
);
const normalizeAngle = (value: number) => ((value + 180) % 360 + 360) % 360 - 180;

function elementFor(root: SVGSVGElement, part: AvatarPart): SVGGElement | null {
  return root.querySelector<SVGGElement>(`[data-avatar-part="${part}"]`);
}

export class SignVerseSkeletalRig {
  private readonly rotations = new Map<AvatarPart, number>();
  private readonly handProjections = new Map<(typeof HAND_PARTS)[number], number>();

  constructor(private readonly root: SVGSVGElement) {
    for (const part of JOINT_PARTS) {
      const definition = BONES[part]!;
      const element = elementFor(root, part);
      const parent = elementFor(root, definition.parent);
      if (!element || !parent || !parent.contains(element)) {
        throw new Error(`SignVerse interpreter hierarchy is invalid at ${definition.parent} -> ${part}.`);
      }
      this.rotations.set(part, definition.restRotation);
      this.applyJoint(part, definition.restRotation);
    }
    HAND_PARTS.forEach((part) => {
      this.handProjections.set(part, NEUTRAL_HAND_PROJECTION);
      this.applyHandProjection(part, NEUTRAL_HAND_PROJECTION);
    });
  }

  applyRootIdle(y: number, scaleY: number): void {
    const body = elementFor(this.root, 'body');
    if (!body) return;
    const [pivotX, pivotY] = SIGNVERSE_INTERPRETER_GEOMETRY.rootPivot;
    body.setAttribute(
      'transform',
      `translate(${pivotX} ${pivotY + y}) scale(1 ${scaleY}) translate(${-pivotX} ${-pivotY})`,
    );
  }

  applyPose(pose: Partial<Record<AvatarPart, AvatarPose>>, blend = 1): void {
    const amount = clamp(blend, 0, 1);
    for (const part of JOINT_PARTS) {
      const targetPose = pose[part];
      if (HAND_PARTS.includes(part as (typeof HAND_PARTS)[number]) && targetPose?.scaleY !== undefined) {
        const handPart = part as (typeof HAND_PARTS)[number];
        const previousProjection = this.handProjections.get(handPart) ?? NEUTRAL_HAND_PROJECTION;
        const targetProjection = clamp(finite(targetPose.scaleY, previousProjection), 0.18, 1);
        const projection = previousProjection + (targetProjection - previousProjection) * amount;
        this.handProjections.set(handPart, projection);
        this.applyHandProjection(handPart, projection);
      }
      if (!targetPose || targetPose.rotation === undefined) continue;
      const definition = BONES[part]!;
      const previous = this.rotations.get(part) ?? definition.restRotation;
      const rawTarget = finite(targetPose.rotation, previous);
      const target = clamp(
        definition.continuous ? rawTarget : normalizeAngle(rawTarget),
        definition.minimum,
        definition.maximum,
      );
      const shortestDelta = ((target - previous + 540) % 360) - 180;
      const delta = definition.continuous && Math.abs(target - previous) <= 180
        ? target - previous
        : shortestDelta;
      const next = previous + delta * amount;
      const rotation = clamp(
        definition.continuous ? next : normalizeAngle(next),
        definition.minimum,
        definition.maximum,
      );
      this.rotations.set(part, rotation);
      this.applyJoint(part, rotation);
    }

    for (const part of FACIAL_PARTS) {
      const facialPose = pose[part];
      if (facialPose) this.applyFacial(part, facialPose);
    }
  }

  setBlink(openness: number): void {
    const scaleY = clamp(openness, 0.06, 1);
    for (const side of ['left', 'right'] as const) {
      const eye = this.root.querySelector<SVGGElement>(`[data-avatar-control="${side}-eye-lid"]`);
      const pivotX = side === 'left' ? -23 : 23;
      eye?.setAttribute(
        'transform',
        `translate(${pivotX} -73) scale(1 ${scaleY}) translate(${-pivotX} 73)`,
      );
    }
  }

  setGaze(x: number, y: number): void {
    for (const side of ['left', 'right'] as const) {
      const pupil = this.root.querySelector<SVGGElement>(`[data-avatar-control="${side}-pupil"]`);
      pupil?.setAttribute('transform', `translate(${clamp(x, -5, 5)} ${clamp(y, -3.5, 3.5)})`);
    }
  }

  setFacialExpression(expression: SignVerseExpression): void {
    const mouth = expression === 'smile'
      ? 'smile'
      : expression === 'surprise'
        ? 'open'
        : expression === 'sadness' || expression === 'negation'
          ? 'frown'
          : expression === 'concentration' || expression === 'emphasis'
            ? 'focus'
            : 'neutral';
    this.root.querySelectorAll<SVGPathElement>('[data-avatar-mouth]').forEach((path) => {
      path.style.opacity = path.dataset.avatarMouth === mouth ? '1' : '0';
    });
  }

  snapshotPose(): AvatarPoseSnapshot {
    const snapshot: AvatarPoseSnapshot = Object.fromEntries(
      Array.from(this.rotations, ([part, rotation]) => [part, { rotation }]),
    );
    HAND_PARTS.forEach((part) => {
      snapshot[part] = {
        ...snapshot[part],
        scaleY: this.handProjections.get(part) ?? NEUTRAL_HAND_PROJECTION,
      };
    });
    return snapshot;
  }

  armChain(side: 'left' | 'right'): {
    shoulder: readonly [number, number];
    elbow: readonly [number, number];
    wrist: readonly [number, number];
  } {
    const direction = side === 'left' ? -1 : 1;
    const clavicleRotation = this.rotations.get(`${side}-clavicle`) ?? 0;
    const clavicleRadians = clavicleRotation * Math.PI / 180;
    const shoulder: readonly [number, number] = [
      SIGNVERSE_INTERPRETER_GEOMETRY.clavicleCenter[0] +
        direction * Math.cos(clavicleRadians) * SIGNVERSE_INTERPRETER_GEOMETRY.clavicleLength,
      SIGNVERSE_INTERPRETER_GEOMETRY.clavicleCenter[1] +
        direction * Math.sin(clavicleRadians) * SIGNVERSE_INTERPRETER_GEOMETRY.clavicleLength,
    ];
    const upperRotation = clavicleRotation + (this.rotations.get(`${side}-upper-arm`) ?? 0);
    const forearmRotation = upperRotation + (this.rotations.get(`${side}-forearm`) ?? 0);
    const elbow: readonly [number, number] = [
      shoulder[0] + Math.cos(upperRotation * Math.PI / 180) * SIGNVERSE_INTERPRETER_GEOMETRY.upperArmLength,
      shoulder[1] + Math.sin(upperRotation * Math.PI / 180) * SIGNVERSE_INTERPRETER_GEOMETRY.upperArmLength,
    ];
    const wrist: readonly [number, number] = [
      elbow[0] + Math.cos(forearmRotation * Math.PI / 180) * SIGNVERSE_INTERPRETER_GEOMETRY.forearmLength,
      elbow[1] + Math.sin(forearmRotation * Math.PI / 180) * SIGNVERSE_INTERPRETER_GEOMETRY.forearmLength,
    ];
    return { shoulder, elbow, wrist };
  }

  private applyJoint(part: AvatarPart, rotation: number): void {
    const element = elementFor(this.root, part);
    if (!element) return;
    const pivot = BONES[part]?.pivot;
    element.setAttribute(
      'transform',
      pivot ? `rotate(${rotation} ${pivot[0]} ${pivot[1]})` : `rotate(${rotation})`,
    );
  }

  private applyHandProjection(part: (typeof HAND_PARTS)[number], projection: number): void {
    const side = part.startsWith('left') ? 'left' : 'right';
    const artwork = this.root.querySelector<SVGGElement>(`[data-avatar-hand-artwork="${side}"]`);
    const mirror = side === 'left' ? -1 : 1;
    artwork?.setAttribute('transform', `scale(1 ${mirror * projection})`);
  }

  private applyFacial(part: AvatarPart, pose: AvatarPose): void {
    const element = elementFor(this.root, part);
    if (!element) return;
    const pivotX = finite(Number(element.dataset.pivotX), 0);
    const pivotY = finite(Number(element.dataset.pivotY), 0);
    const scaleX = clamp(finite(pose.scaleX, 1), 0.05, 3);
    const scaleY = clamp(finite(pose.scaleY, 1), 0.05, 3);
    const rotation = clamp(finite(pose.rotation, 0), -25, 25);
    element.setAttribute('transform', [
      `translate(${pivotX + finite(pose.x, 0)} ${pivotY + finite(pose.y, 0)})`,
      `rotate(${rotation})`,
      `scale(${scaleX} ${scaleY})`,
      `translate(${-pivotX} ${-pivotY})`,
    ].join(' '));
    element.style.opacity = String(clamp(finite(pose.opacity, 1), 0, 1));
  }
}
