import type { NonManualMarker } from '../../shared/interpretation';
import type { AvatarPoseSnapshot, RenderingDiagnostics } from '../types';
import { AnimationController } from './controllers/AnimationController';
import { ExpressionController } from './controllers/ExpressionController';
import { HandController } from './controllers/HandController';
import { IdleReadinessController } from './controllers/IdleReadinessController';
import { RenderLoop } from './controllers/RenderLoop';
import { RigController } from './controllers/RigController';
import { SecondaryMotionController } from './controllers/SecondaryMotionController';
import {
  CoArticulationController,
  mergeWithNeutral,
  WristFingerRefinementController,
} from './motion';

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

export class AvatarAnimationEngine {
  private readonly animation: AnimationController;
  private readonly coArticulation: CoArticulationController;
  private readonly expression = new ExpressionController();
  private readonly hands = new HandController();
  private readonly idleReadiness = new IdleReadinessController();
  private readonly rig: RigController;
  private readonly neutralPose: AvatarPoseSnapshot;
  private readonly mergedPose: Partial<Record<AvatarPart, AvatarPose>> = {};
  private readonly secondary = new SecondaryMotionController();
  private readonly wristAndFingers = new WristFingerRefinementController();
  private readonly renderLoop: RenderLoop;
  private playing = false;
  private holdNeutral = false;
  private pendingInitialSeek = false;
  private requestedTransitionMs?: number;
  private availableTransitionMs?: number;
  private motionProfile = 'precise';
  private transitionHint?: string;

  constructor(
    private readonly root: SVGSVGElement,
    clip?: AvatarClip,
    private readonly reducedMotion = false,
  ) {
    this.animation = new AnimationController(clip);
    this.rig = new RigController(root);
    this.neutralPose = this.rig.neutralPose();
    this.coArticulation = new CoArticulationController({ reducedMotion });
    const renderState = {
      queueDepth: 0,
      blendDurationMs: 0,
      activeAnimation: 'idle',
    };
    this.renderLoop = new RenderLoop(
      (time, elapsedSeconds) => this.renderFrame(time, elapsedSeconds),
      () => {
        renderState.queueDepth = this.animation.queueDepth;
        renderState.blendDurationMs = this.coArticulation.configuredDurationMs;
        renderState.activeAnimation = this.animation.activeAnimation;
        return renderState;
      },
    );
  }

  play(speed = 1): void {
    this.animation.setSpeed(speed);
    if (this.playing) return;
    if (this.holdNeutral && this.animation.hasClip && !this.reducedMotion) {
      const current = this.rig.snapshot();
      this.wristAndFingers.seed(current);
      this.secondary.seed(current);
      this.coArticulation.beginTransition(current, this.animation.activeAnimation);
    }
    this.holdNeutral = false;
    this.playing = true;
    if (this.reducedMotion) {
      this.renderFrame(performance.now(), 0, 1);
      return;
    }
    this.renderLoop.start();
  }

  pause(): void {
    if (!this.playing && this.holdNeutral) return;
    this.playing = false;
    this.holdNeutral = true;
    const current = this.rig.snapshot();
    this.wristAndFingers.seed(current);
    this.secondary.seed(current);
    this.coArticulation.beginIdleRecovery(current, this.neutralPose);
    if (this.reducedMotion) {
      this.renderFrame(performance.now(), 0, 1);
      return;
    }
    this.renderLoop.start();
  }

  resume(speed = 1): void {
    this.play(speed);
  }

  stop(): void {
    const current = this.rig.snapshot();
    this.animation.reset();
    this.playing = false;
    this.holdNeutral = true;
    this.expression.reset();
    this.wristAndFingers.seed(current);
    this.secondary.seed(current);
    if (this.reducedMotion) {
      this.coArticulation.cancel();
      this.rig.apply(this.neutralPose, 1);
      return;
    }
    this.coArticulation.beginIdleRecovery(current, this.neutralPose);
    this.renderLoop.start();
  }

  seek(progress: number): void {
    const currentProgress = this.animation.currentProgress;
    const discontinuity = Math.abs(progress - currentProgress) > this.seekThreshold();
    this.animation.seek(progress);
    if (this.pendingInitialSeek) {
      this.pendingInitialSeek = false;
    } else if (discontinuity && this.playing && !this.holdNeutral) {
      const current = this.rig.snapshot();
      this.wristAndFingers.seed(current);
      this.secondary.seed(current);
      this.coArticulation.beginTransition(
        current,
        `${this.animation.activeAnimation}:seek`,
      );
    }
    this.renderFrame(performance.now(), 0, 1);
  }

  configureTransition(
    durationMs: number | undefined,
    availableDurationMs?: number,
  ): void {
    this.requestedTransitionMs = durationMs;
    this.availableTransitionMs = availableDurationMs;
    this.configureMotionControllers();
  }

  configureMotion(profile: string | undefined, transitionHint?: string): void {
    this.motionProfile = profile ?? 'precise';
    this.transitionHint = transitionHint;
    this.configureMotionControllers();
  }

  setTransitionSource(pose: AvatarPoseSnapshot, previousAnimationId?: string): void {
    const source = Object.keys(pose).length > 0 ? pose : this.neutralPose;
    this.wristAndFingers.seed(source);
    this.secondary.seed(source);
    this.coArticulation.beginTransition(
      source,
      this.animation.activeAnimation,
      previousAnimationId,
    );
    this.pendingInitialSeek = true;
  }

  setNonManualMarkers(markers: NonManualMarker[]): void {
    this.expression.setMarkers(markers);
  }

  setHandShape(side: AvatarSide, shape: string): void {
    this.hands.setShape(side, shape);
  }

  snapshotPose(): AvatarPoseSnapshot {
    return this.rig.snapshot();
  }

  diagnostics(): RenderingDiagnostics {
    const motion = this.coArticulation.diagnostics();
    const rendering = this.renderLoop.diagnostics();
    return {
      ...rendering,
      blendDurationMs: this.coArticulation.configuredDurationMs,
      motion: {
        ...motion,
        wristFingerSamples: this.wristAndFingers.samples,
      },
    };
  }

  dispose(): void {
    this.playing = false;
    this.renderLoop.stop();
    this.coArticulation.dispose();
    this.secondary.reset();
    this.wristAndFingers.reset();
    this.root.remove();
  }

  private renderFrame(time: number, elapsedSeconds: number, smoothing?: number): void {
    if (this.playing) this.animation.advance(elapsedSeconds);
    const motionElapsedMs = elapsedSeconds * 1_000 * (
      this.coArticulation.returningToIdle ? 1 : this.animation.currentSpeed
    );
    this.coArticulation.advance(motionElapsedMs);
    this.rig.renderIdle(time, this.reducedMotion);

    let pose = this.holdNeutral ? {} : this.animation.sample();
    this.hands.apply(pose);
    pose = mergeWithNeutral(this.neutralPose, pose, this.mergedPose);
    // The waiting avatar may move naturally, but governed sign clips remain
    // authoritative and are never modified by this non-linguistic idle motion.
    if (!this.animation.hasClip && !this.holdNeutral) {
      this.idleReadiness.apply(pose, time, this.reducedMotion);
    }
    pose = this.coArticulation.apply(pose);
    const terminalFrame = this.animation.finished && !this.coArticulation.active;
    this.wristAndFingers.apply(pose, elapsedSeconds, terminalFrame, this.reducedMotion);
    const exactTransitionEndpoint = this.coArticulation.active && elapsedSeconds === 0;
    if ((!terminalFrame || this.holdNeutral) && !exactTransitionEndpoint) {
      this.secondary.apply(pose, time, this.reducedMotion);
    }
    // Non-manual grammar belongs to the active phrase and must not be faded by
    // a skeletal transition from the previous sign.
    this.expression.apply(this.rig.rig, pose, time);
    const amount = smoothing ?? 1;
    this.rig.apply(pose, amount);
  }

  private configureMotionControllers(): void {
    this.coArticulation.configure(
      this.requestedTransitionMs,
      this.availableTransitionMs,
      this.reducedMotion,
      this.motionProfile,
      this.transitionHint,
    );
    this.wristAndFingers.configure(this.motionProfile);
    this.secondary.configure(this.motionProfile);
  }

  private seekThreshold(): number {
    if (this.animation.duration <= 0) return 0.12;
    return Math.max(0.06, Math.min(0.18, 0.15 / this.animation.duration));
  }

  get activeAnimationId(): string {
    return this.animation.activeAnimation;
  }
}
