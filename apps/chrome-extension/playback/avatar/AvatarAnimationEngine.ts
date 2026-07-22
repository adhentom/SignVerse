import { SignVerseSkeletalRig } from './signVerseInterpreter/SignVerseSkeletalRig';
import {
  resolveSignVerseExpression,
  signVerseExpressionPose,
} from './signVerseInterpreter/expressionSystem';
import {
  isSignVerseHandShape,
  signVerseHandShapePose,
  type SignVerseHandShape,
} from './signVerseInterpreter/handShapeLibrary';
import type { NonManualMarker } from '../../shared/interpretation';
import type { AvatarPoseSnapshot } from '../types';

type AvatarSide = 'left' | 'right';
type Finger = 'thumb' | 'index' | 'middle' | 'ring' | 'little';
type FingerPart = `${AvatarSide}-${Finger}` |
  `${AvatarSide}-${Finger}-${'middle' | 'distal'}`;
type ProfessionalFingerPart = `${AvatarSide}-${Finger}-${'mcp' | 'pip' | 'dip'}`;
type ThumbCarpometacarpalPart = `${AvatarSide}-thumb-cmc`;

export type AvatarPart =
  | 'body' | 'torso' | 'neck' | 'head' | 'eyes' | 'left-eye' | 'right-eye'
  | 'eyebrows' | 'left-eyebrow' | 'right-eyebrow' | 'nose' | 'mouth' | 'jaw'
  | 'pelvis' | 'left-thigh' | 'right-thigh' | 'left-shin' | 'right-shin'
  | 'left-foot' | 'right-foot'
  | 'left-clavicle' | 'right-clavicle'
  | 'left-upper-arm' | 'left-forearm' | 'left-hand'
  | 'right-upper-arm' | 'right-forearm' | 'right-hand'
  | FingerPart | ProfessionalFingerPart | ThumbCarpometacarpalPart;

export interface AvatarPose {
  x?: number;
  y?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  opacity?: number;
}

export interface AvatarKeyframe {
  offset: number;
  pose: Partial<Record<AvatarPart, AvatarPose>>;
}

export interface AvatarClip {
  id: string;
  duration: number;
  keyframes: AvatarKeyframe[];
  rig?: {
    name: string;
    version: string;
    coordinate_space: string;
    solver: string;
  };
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const lerp = (from = 0, to = 0, progress: number) => from + (to - from) * progress;
const smoothStep = (value: number) => value * value * value * (value * (value * 6 - 15) + 10);
const lerpAngle = (from = 0, to = 0, progress: number) => {
  const delta = ((to - from + 540) % 360) - 180;
  return from + delta * progress;
};

export class AvatarAnimationEngine {
  private frame = 0;
  private playing = false;
  private progress = 0;
  private speed = 1;
  private lastTime = 0;
  private readonly rig: SignVerseSkeletalRig;
  private transitionSource?: AvatarPoseSnapshot;
  private nonManualMarkers: NonManualMarker[] = [];
  private handShapes: Partial<Record<AvatarSide, SignVerseHandShape>> = {};

  constructor(
    private readonly root: SVGSVGElement,
    private readonly clip?: AvatarClip,
    private readonly reducedMotion = false,
  ) {
    this.rig = new SignVerseSkeletalRig(root);
  }

  play(speed = 1): void {
    this.speed = speed;
    if (this.playing || this.reducedMotion) return;
    this.playing = true;
    this.lastTime = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }

  pause(): void {
    this.playing = false;
    cancelAnimationFrame(this.frame);
  }

  resume(speed = this.speed): void {
    this.play(speed);
  }

  stop(): void {
    this.pause();
    this.progress = 0;
    this.render(0, performance.now());
  }

  seek(progress: number): void {
    this.progress = clamp(progress);
    this.render(this.progress, performance.now());
  }

  setTransitionSource(pose: AvatarPoseSnapshot): void {
    this.transitionSource = pose;
  }

  setNonManualMarkers(markers: NonManualMarker[]): void {
    this.nonManualMarkers = markers;
  }

  setHandShape(side: AvatarSide, shape: string): void {
    if (isSignVerseHandShape(shape)) {
      this.handShapes[side] = shape.trim().toLowerCase() as SignVerseHandShape;
    }
  }

  snapshotPose(): AvatarPoseSnapshot {
    return this.rig.snapshotPose();
  }

  dispose(): void {
    this.pause();
    this.root.remove();
  }

  private readonly tick = (time: number): void => {
    if (!this.playing) return;
    const elapsed = Math.max(0, time - this.lastTime) / 1_000;
    this.lastTime = time;
    if (this.clip) {
      this.progress = Math.min(1, this.progress + elapsed * this.speed / this.clip.duration);
    }
    const blend = 1 - Math.exp(-elapsed * 24);
    this.render(this.progress, time, blend);
    this.frame = requestAnimationFrame(this.tick);
  };

  private render(progress: number, time: number, blend = 1): void {
    const idle = this.reducedMotion ? 0 : Math.sin(time / 900);
    this.rig.applyRootIdle(idle * 1.6, 1 + idle * 0.004);
    this.rig.setBlink(this.reducedMotion ? 1 : this.blinkOpenness(time));
    this.rig.setGaze(0, 0);
    this.rig.setFacialExpression(resolveSignVerseExpression(this.nonManualMarkers));
    if (!this.clip) {
      this.rig.applyPose({ head: { rotation: idle * 0.7 } }, blend);
      return;
    }

    const frames = this.clip.keyframes;
    const endIndex = Math.max(1, frames.findIndex((frame) => frame.offset >= progress));
    const from = frames[endIndex - 1] ?? frames[0];
    const to = frames[endIndex] ?? frames.at(-1)!;
    const local = smoothStep(clamp(
      (progress - from.offset) / Math.max(0.0001, to.offset - from.offset),
    ));
    const parts = new Set([...Object.keys(from.pose), ...Object.keys(to.pose)] as AvatarPart[]);
    const pose: Partial<Record<AvatarPart, AvatarPose>> = {};
    parts.forEach((part) => {
      const a = from.pose[part] ?? {};
      const b = to.pose[part] ?? a;
      pose[part] = {
        x: lerp(a.x, b.x, local), y: lerp(a.y, b.y, local),
        rotation: lerpAngle(a.rotation, b.rotation, local),
        scaleX: lerp(a.scaleX ?? 1, b.scaleX ?? 1, local),
        scaleY: lerp(a.scaleY ?? 1, b.scaleY ?? 1, local),
        opacity: lerp(a.opacity ?? 1, b.opacity ?? 1, local),
      };
    });
    if (!pose.head) pose.head = { rotation: idle * 0.7 };
    else pose.head.rotation = (pose.head.rotation ?? 0) + idle * 0.7;
    if (!pose.torso) pose.torso = { rotation: idle * 0.35 };
    if (this.transitionSource && progress < 0.15) {
      const transition = smoothStep(clamp(progress / 0.15));
      const parts = new Set([
        ...Object.keys(this.transitionSource),
        ...Object.keys(pose),
      ] as AvatarPart[]);
      parts.forEach((part) => {
        const source = this.transitionSource?.[part] ?? {};
        const target = pose[part] ?? source;
        pose[part] = {
          rotation: lerpAngle(source.rotation, target.rotation, transition),
          scaleX: lerp(source.scaleX ?? 1, target.scaleX ?? 1, transition),
          scaleY: lerp(source.scaleY ?? 1, target.scaleY ?? 1, transition),
          opacity: lerp(source.opacity ?? 1, target.opacity ?? 1, transition),
          x: lerp(source.x, target.x, transition),
          y: lerp(source.y, target.y, transition),
        };
      });
    }
    // Non-manual grammar belongs to the current phrase and must not be faded out
    // by the skeletal transition from the previous sign.
    Object.entries(this.handShapes).forEach(([side, shape]) => {
      if (shape) Object.assign(pose, signVerseHandShapePose(side as AvatarSide, shape));
    });
    this.mergePose(
      pose,
      signVerseExpressionPose(resolveSignVerseExpression(this.nonManualMarkers)),
    );
    this.mergePose(pose, this.expressionPose(time));
    this.rig.applyPose(pose, blend);
  }

  private expressionPose(time: number): Partial<Record<AvatarPart, AvatarPose>> {
    const pose: Partial<Record<AvatarPart, AvatarPose>> = {};
    const oscillation = Math.sin(time / 105);
    this.nonManualMarkers.forEach((marker) => {
      const weight = marker.intensity;
      switch (marker.marker) {
        case 'brow-raise': pose.eyebrows = { y: -4 * weight }; break;
        case 'brow-lower': pose.eyebrows = { y: 3 * weight, scaleY: 0.82 }; break;
        case 'head-shake': pose.head = { rotation: oscillation * 9 * weight }; break;
        case 'head-nod': pose.neck = { rotation: oscillation * 5 * weight }; break;
        case 'head-tilt': pose.head = { rotation: 8 * weight }; break;
        case 'eye-gaze': {
          const direction = marker.value.toLowerCase();
          this.rig.setGaze(
            direction.includes('left') ? -3 * weight : direction.includes('right') ? 3 * weight : 0,
            direction.includes('up') ? -2 * weight : direction.includes('down') ? 2 * weight : 0,
          );
          break;
        }
        case 'mouth-gesture': pose.mouth = { scaleY: 1 + 0.8 * weight }; break;
        case 'body-shift': pose.torso = { rotation: oscillation * 3 * weight }; break;
        case 'facial-emotion': {
          if (marker.value.toLowerCase().includes('happy')) {
            pose.mouth = { scaleY: 1 + 0.2 * weight };
            pose.eyebrows = { y: -2 * weight };
          } else if (marker.value.toLowerCase().includes('sad')) {
            pose.eyebrows = { y: 2 * weight, rotation: -4 * weight };
          }
          break;
        }
      }
    });
    return pose;
  }

  private blinkOpenness(time: number): number {
    const phase = time % 3_200;
    if (phase < 80) return 1 - phase / 80;
    if (phase < 160) return (phase - 80) / 80;
    return 1;
  }

  private mergePose(
    target: Partial<Record<AvatarPart, AvatarPose>>,
    addition: Partial<Record<AvatarPart, AvatarPose>>,
  ): void {
    Object.entries(addition).forEach(([key, next]) => {
      const part = key as AvatarPart;
      const current = target[part] ?? {};
      target[part] = {
        ...current,
        ...next,
        rotation: (current.rotation ?? 0) + (next.rotation ?? 0),
      };
    });
  }
}
