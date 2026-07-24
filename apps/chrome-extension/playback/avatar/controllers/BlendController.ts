import type { AvatarPart, AvatarPose } from '../AvatarAnimationEngine';
import type { AvatarPoseSnapshot } from '../../types';
import { interpolateAngle } from './AnimationController';

type Pose = Partial<Record<AvatarPart, AvatarPose>>;

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => {
  const progress = clamp(value);
  return progress * progress * (3 - 2 * progress);
};
const lerp = (from = 0, to = 0, progress: number) => from + (to - from) * progress;

export class BlendController {
  private source?: AvatarPoseSnapshot;
  private idleTarget?: AvatarPoseSnapshot;
  private elapsedMs = 0;
  private durationMs = 180;
  private mode: 'idle' | 'blend-in' | 'blend-out' = 'idle';

  configure(durationMs: number | undefined, reducedMotion: boolean): void {
    this.durationMs = reducedMotion
      ? 0
      : Math.max(0, Math.min(500, Number.isFinite(durationMs) ? durationMs! : 180));
  }

  beginFrom(source: AvatarPoseSnapshot): void {
    this.source = Object.freeze({ ...source });
    this.idleTarget = undefined;
    this.elapsedMs = 0;
    this.mode = Object.keys(source).length > 0 && this.durationMs > 0 ? 'blend-in' : 'idle';
  }

  beginReturnToIdle(source: AvatarPoseSnapshot, target: AvatarPoseSnapshot): void {
    if (this.mode === 'blend-out') return;
    this.source = Object.freeze({ ...source });
    this.idleTarget = Object.freeze({ ...target });
    this.elapsedMs = 0;
    this.mode = this.durationMs > 0 ? 'blend-out' : 'idle';
  }

  cancelReturn(): void {
    if (this.mode === 'blend-out') {
      this.source = undefined;
      this.idleTarget = undefined;
      this.mode = 'idle';
    }
  }

  advance(elapsedMs: number): void {
    if (this.mode === 'idle') return;
    this.elapsedMs += Math.max(0, elapsedMs);
    if (this.elapsedMs >= this.durationMs) {
      this.elapsedMs = this.durationMs;
      if (this.mode === 'blend-in') {
        this.source = undefined;
        this.mode = 'idle';
      }
    }
  }

  apply(target: Pose): Pose {
    if (!this.source || this.mode === 'idle') return target;
    const progress = this.durationMs === 0 ? 1 : ease(this.elapsedMs / this.durationMs);
    if (this.mode === 'blend-out' && this.idleTarget) {
      return blendPose(this.source, this.idleTarget, progress);
    }
    return blendPose(this.source, target, progress);
  }

  get active(): boolean { return this.mode !== 'idle'; }
  get returningToIdle(): boolean { return this.mode === 'blend-out'; }
  get configuredDurationMs(): number { return this.durationMs; }
}

function blendPose(from: AvatarPoseSnapshot, to: Pose, progress: number): Pose {
  const pose: Pose = {};
  const parts = new Set([...Object.keys(from), ...Object.keys(to)] as AvatarPart[]);
  for (const part of parts) {
    const start = from[part] ?? {};
    const finish = to[part] ?? start;
    pose[part] = {
      rotation: interpolateAngle(start.rotation, finish.rotation, progress),
      scaleX: lerp(start.scaleX ?? 1, finish.scaleX ?? 1, progress),
      scaleY: lerp(start.scaleY ?? 1, finish.scaleY ?? 1, progress),
      opacity: lerp(start.opacity ?? 1, finish.opacity ?? 1, progress),
      x: lerp(start.x, finish.x, progress),
      y: lerp(start.y, finish.y, progress),
    };
  }
  return pose;
}
