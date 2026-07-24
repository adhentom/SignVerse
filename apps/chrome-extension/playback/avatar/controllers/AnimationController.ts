import type {
  AvatarClip,
  AvatarKeyframe,
  AvatarPart,
  AvatarPose,
} from '../AvatarAnimationEngine';

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export class AnimationController {
  private progress = 0;
  private speed = 1;

  constructor(private readonly clip?: AvatarClip) {}

  setSpeed(speed: number): void {
    this.speed = Number.isFinite(speed) ? Math.max(0.25, Math.min(2, speed)) : 1;
  }

  advance(elapsedSeconds: number): void {
    if (!this.clip || this.progress >= 1) return;
    this.progress = clamp(
      this.progress + Math.max(0, elapsedSeconds) * this.speed / this.clip.duration,
    );
  }

  seek(progress: number): void {
    this.progress = clamp(progress);
  }

  reset(): void {
    this.progress = 0;
  }

  sample(): Partial<Record<AvatarPart, AvatarPose>> {
    return this.sampleAt(this.progress);
  }

  sampleAt(progress: number): Partial<Record<AvatarPart, AvatarPose>> {
    if (!this.clip) return {};
    const frames = this.clip.keyframes;
    const endIndex = findEndFrame(frames, clamp(progress));
    const from = frames[endIndex - 1] ?? frames[0];
    const to = frames[endIndex] ?? frames.at(-1)!;
    const before = frames[endIndex - 2] ?? from;
    const after = frames[endIndex + 1] ?? to;
    const local = clamp(
      (progress - from.offset) / Math.max(0.0001, to.offset - from.offset),
    );
    const parts = new Set([...Object.keys(from.pose), ...Object.keys(to.pose)] as AvatarPart[]);
    const pose: Partial<Record<AvatarPart, AvatarPose>> = {};
    for (const part of parts) {
      const hasStart = from.pose[part] !== undefined;
      const hasFinish = to.pose[part] !== undefined;
      // A sparse future keyframe must not make a joint move before its
      // governed timestamp. The rig supplies neutral values while absent.
      if (!hasStart && hasFinish && local < 1) continue;
      if (hasStart && !hasFinish && local >= 1) continue;
      const start = from.pose[part] ?? {};
      const finish = to.pose[part] ?? start;
      const previous = before.pose[part] ?? start;
      const next = after.pose[part] ?? finish;
      pose[part] = {
        x: interpolateOptional(
          previous.x, start.x, finish.x, next.x, local,
          before.offset, from.offset, to.offset, after.offset,
        ),
        y: interpolateOptional(
          previous.y, start.y, finish.y, next.y, local,
          before.offset, from.offset, to.offset, after.offset,
        ),
        rotation: interpolateCubicAngle(
          previous.rotation,
          start.rotation,
          finish.rotation,
          next.rotation,
          local,
          before.offset,
          from.offset,
          to.offset,
          after.offset,
        ),
        scaleX: interpolateBounded(
          previous.scaleX, start.scaleX, finish.scaleX, next.scaleX, local,
          before.offset, from.offset, to.offset, after.offset, 0.05, 3,
        ),
        scaleY: interpolateBounded(
          previous.scaleY, start.scaleY, finish.scaleY, next.scaleY, local,
          before.offset, from.offset, to.offset, after.offset, 0.05, 3,
        ),
        opacity: interpolateBounded(
          previous.opacity, start.opacity, finish.opacity, next.opacity, local,
          before.offset, from.offset, to.offset, after.offset, 0, 1,
        ),
      };
    }
    return pose;
  }

  get currentProgress(): number { return this.progress; }
  get finished(): boolean { return Boolean(this.clip) && this.progress >= 1; }
  get activeAnimation(): string { return this.clip?.id ?? 'idle'; }
  get queueDepth(): number { return this.clip && !this.finished ? 1 : 0; }
  get duration(): number { return this.clip?.duration ?? 0; }
  get currentSpeed(): number { return this.speed; }
  get hasClip(): boolean { return Boolean(this.clip); }
}

export function interpolateAngle(from = 0, to = 0, progress: number): number {
  const delta = ((to - from + 540) % 360) - 180;
  return from + delta * progress;
}

function findEndFrame(frames: AvatarKeyframe[], progress: number): number {
  let lower = 1;
  let upper = Math.max(1, frames.length - 1);
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if (frames[middle]!.offset >= progress) upper = middle;
    else lower = middle + 1;
  }
  return lower;
}

function interpolateCubicAngle(
  before: number | undefined,
  from: number | undefined,
  to: number | undefined,
  after: number | undefined,
  progress: number,
  beforeOffset: number,
  fromOffset: number,
  toOffset: number,
  afterOffset: number,
): number | undefined {
  if (before === undefined && from === undefined && to === undefined && after === undefined) {
    return undefined;
  }
  if (from !== undefined && to !== undefined && Math.abs(angleDelta(from, to)) < 0.0001) {
    return from;
  }
  const start = from ?? to ?? before ?? after ?? 0;
  const finish = interpolateAngle(start, to ?? start, 1);
  const previous = start - angleDelta(before ?? start, start);
  const next = finish + angleDelta(to ?? finish, after ?? finish);
  return cubicHermite(
    previous,
    start,
    finish,
    next,
    progress,
    beforeOffset,
    fromOffset,
    toOffset,
    afterOffset,
  );
}

function angleDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

function interpolateOptional(
  before: number | undefined,
  from: number | undefined,
  to: number | undefined,
  after: number | undefined,
  progress: number,
  beforeOffset: number,
  fromOffset: number,
  toOffset: number,
  afterOffset: number,
): number | undefined {
  if (before === undefined && from === undefined && to === undefined && after === undefined) {
    return undefined;
  }
  if (from !== undefined && to !== undefined && Math.abs(from - to) < 0.0001) {
    return from;
  }
  const start = from ?? to ?? before ?? after ?? 0;
  const finish = to ?? start;
  return cubicHermite(
    before ?? start,
    start,
    finish,
    after ?? finish,
    progress,
    beforeOffset,
    fromOffset,
    toOffset,
    afterOffset,
  );
}

function interpolateBounded(
  before: number | undefined,
  from: number | undefined,
  to: number | undefined,
  after: number | undefined,
  progress: number,
  beforeOffset: number,
  fromOffset: number,
  toOffset: number,
  afterOffset: number,
  minimum: number,
  maximum: number,
): number | undefined {
  const value = interpolateOptional(
    before,
    from,
    to,
    after,
    progress,
    beforeOffset,
    fromOffset,
    toOffset,
    afterOffset,
  );
  return value === undefined ? undefined : Math.max(minimum, Math.min(maximum, value));
}

function cubicHermite(
  before: number,
  from: number,
  to: number,
  after: number,
  progress: number,
  beforeOffset: number,
  fromOffset: number,
  toOffset: number,
  afterOffset: number,
): number {
  const duration = Math.max(0.0001, toOffset - fromOffset);
  const secant = (to - from) / duration;
  if (Math.abs(secant) < 0.0001) return from;
  const incomingDuration = toOffset - beforeOffset;
  const outgoingDuration = afterOffset - fromOffset;
  let incomingSlope = incomingDuration > 0.0001
    ? (to - before) / incomingDuration
    : (to - from) / duration;
  let outgoingSlope = outgoingDuration > 0.0001
    ? (after - from) / outgoingDuration
    : (to - from) / duration;
  if (incomingSlope * secant <= 0) incomingSlope = 0;
  if (outgoingSlope * secant <= 0) outgoingSlope = 0;
  const slopeMagnitude = (incomingSlope / secant) ** 2 + (outgoingSlope / secant) ** 2;
  if (slopeMagnitude > 9) {
    const scale = 3 / Math.sqrt(slopeMagnitude);
    incomingSlope *= scale;
    outgoingSlope *= scale;
  }
  const squared = progress * progress;
  const cubed = squared * progress;
  const startBasis = 2 * cubed - 3 * squared + 1;
  const startTangentBasis = cubed - 2 * squared + progress;
  const finishBasis = -2 * cubed + 3 * squared;
  const finishTangentBasis = cubed - squared;
  const value = startBasis * from +
    startTangentBasis * duration * incomingSlope +
    finishBasis * to +
    finishTangentBasis * duration * outgoingSlope;
  return Math.max(Math.min(from, to), Math.min(Math.max(from, to), value));
}
