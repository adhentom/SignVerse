import type { AvatarPart, AvatarPose } from '../AvatarAnimationEngine';

type Pose = Partial<Record<AvatarPart, AvatarPose>>;

const GREETING_CYCLE_MS = 7_200;
const RAISE_DURATION_MS = 750;
const WAVE_DURATION_MS = 2_050;
const LOWER_DURATION_MS = 750;
const RAISED_UPPER_ARM_ROTATION = 20;
const RAISED_FOREARM_ROTATION = -112;
const WAVE_ROTATION = 22;
const WAVE_COUNT = 3;

/**
 * Adds a short, non-linguistic "Hi" wave while the interpreter is idle.
 *
 * This controller must never run over a governed animation clip. Its purpose is
 * only to make the waiting avatar visibly responsive without suggesting that an
 * unavailable interpretation is being signed.
 */
export class IdleReadinessController {
  private startedAt?: number;

  apply(pose: Pose, time: number, reducedMotion: boolean): void {
    if (reducedMotion) {
      this.reset();
      return;
    }

    this.startedAt ??= time;
    const phase = (time - this.startedAt) % GREETING_CYCLE_MS;
    const waveStart = RAISE_DURATION_MS;
    const waveEnd = waveStart + WAVE_DURATION_MS;
    const lowerEnd = waveEnd + LOWER_DURATION_MS;

    let lift = 0;
    let wave = 0;
    if (phase < waveStart) {
      lift = easeInOut(phase / RAISE_DURATION_MS);
    } else if (phase < waveEnd) {
      lift = 1;
      const waveProgress = (phase - waveStart) / WAVE_DURATION_MS;
      wave = Math.sin(waveProgress * Math.PI * 2 * WAVE_COUNT) * WAVE_ROTATION;
    } else if (phase < lowerEnd) {
      lift = 1 - easeInOut((phase - waveEnd) / LOWER_DURATION_MS);
    }

    if (lift <= 0) return;

    blendRotation(pose, 'right-upper-arm', RAISED_UPPER_ARM_ROTATION, lift);
    blendRotation(pose, 'right-forearm', RAISED_FOREARM_ROTATION, lift);
    blendRotation(pose, 'right-hand', wave, lift);
    blendScaleY(pose, 'right-hand', 1, lift);
  }

  reset(): void {
    this.startedAt = undefined;
  }
}

function blendRotation(pose: Pose, part: AvatarPart, rotation: number, amount: number): void {
  const component = pose[part];
  const previous = component?.rotation ?? 0;
  const next = previous + (rotation - previous) * amount;
  if (component) {
    component.rotation = next;
    return;
  }
  pose[part] = { rotation: next };
}

function blendScaleY(pose: Pose, part: AvatarPart, scaleY: number, amount: number): void {
  const component = pose[part];
  const previous = component?.scaleY ?? 0.78;
  const next = previous + (scaleY - previous) * amount;
  if (component) {
    component.scaleY = next;
    return;
  }
  pose[part] = { scaleY: next };
}

function easeInOut(value: number): number {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}
