import type { RenderingDiagnostics } from '../../types';
import {
  avatarRuntimeResourcePolicy,
  createFrameScheduler,
  RenderingHealthMonitor,
  type FrameScheduler,
  type RuntimeResourcePolicy,
} from '../runtime';

interface RenderState {
  queueDepth: number;
  blendDurationMs: number;
  activeAnimation: string;
}

export interface RenderLoopOptions {
  scheduler?: FrameScheduler;
  healthMonitor?: RenderingHealthMonitor;
  resourcePolicy?: RuntimeResourcePolicy;
  maxConsecutiveRenderFailures?: number;
  onFatalError?: (error: unknown) => void;
}

export class RenderLoop {
  private frame?: number;
  private running = false;
  private lastRenderedAt = 0;
  private sampleStartedAt = 0;
  private sampleFrames = 0;
  private droppedFrames = 0;
  private consecutiveRenderFailures = 0;
  private generation = 0;
  private readonly scheduler: FrameScheduler;
  private readonly healthMonitor: RenderingHealthMonitor;
  private readonly resourcePolicy: RuntimeResourcePolicy;
  private readonly maxConsecutiveRenderFailures: number;
  private readonly onFatalError?: (error: unknown) => void;
  private metrics: RenderingDiagnostics = {
    fps: 0,
    frameTimeMs: 0,
    animationQueueDepth: 0,
    blendDurationMs: 0,
    activeAnimation: 'idle',
    droppedRenderFrames: 0,
  };

  constructor(
    private readonly render: (time: number, elapsedSeconds: number) => void,
    private readonly state: () => RenderState,
    options: RenderLoopOptions = {},
  ) {
    this.scheduler = options.scheduler ?? createFrameScheduler();
    this.resourcePolicy = options.resourcePolicy ?? avatarRuntimeResourcePolicy;
    this.healthMonitor = options.healthMonitor ?? new RenderingHealthMonitor({
      now: () => this.scheduler.now(),
      resourcePolicy: this.resourcePolicy,
      schedulerKind: this.scheduler.kind,
    });
    this.maxConsecutiveRenderFailures = Math.max(
      0,
      Math.floor(options.maxConsecutiveRenderFailures ?? 1),
    );
    this.onFatalError = options.onFatalError;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const generation = ++this.generation;
    const startedAt = this.scheduler.now();
    this.lastRenderedAt = startedAt;
    this.sampleStartedAt = startedAt;
    this.consecutiveRenderFailures = 0;
    this.healthMonitor.start(this.scheduler.kind);
    this.schedule(generation);
  }

  stop(): void {
    this.running = false;
    this.generation += 1;
    if (this.frame !== undefined) this.scheduler.cancel(this.frame);
    this.frame = undefined;
    this.healthMonitor.stop();
  }

  diagnostics(): RenderingDiagnostics {
    return Object.freeze({
      ...this.metrics,
      health: this.healthMonitor.snapshot(),
    });
  }

  private schedule(generation: number): void {
    this.frame = this.scheduler.request((time) => this.tick(time, generation));
  }

  private tick(time: number, generation: number): void {
    if (!this.running || generation !== this.generation) return;
    const renderState = this.state();
    const inactive = renderState.queueDepth === 0 && renderState.activeAnimation === 'idle';
    const inactiveInterval = this.resourcePolicy.current.inactiveFrameIntervalMs;
    if (
      inactive &&
      inactiveInterval > 0 &&
      time - this.lastRenderedAt < inactiveInterval
    ) {
      this.healthMonitor.recordSkippedFrame();
      this.schedule(generation);
      return;
    }

    const frameTimeMs = Math.max(0, time - this.lastRenderedAt);
    const expectedFrameMs = inactive && inactiveInterval > 0
      ? inactiveInterval
      : 1_000 / 60;
    const droppedThisFrame = frameTimeMs > expectedFrameMs * 1.5
      ? Math.max(1, Math.floor(frameTimeMs / expectedFrameMs) - 1)
      : 0;
    this.droppedFrames += droppedThisFrame;
    this.sampleFrames += 1;
    const sampleDuration = time - this.sampleStartedAt;
    const fps = sampleDuration >= 500
      ? this.sampleFrames * 1_000 / Math.max(1, sampleDuration)
      : this.metrics.fps;
    if (sampleDuration >= 500) {
      this.sampleFrames = 0;
      this.sampleStartedAt = time;
    }
    this.metrics.fps = fps;
    this.metrics.frameTimeMs = frameTimeMs;
    this.metrics.animationQueueDepth = renderState.queueDepth;
    this.metrics.blendDurationMs = renderState.blendDurationMs;
    this.metrics.activeAnimation = renderState.activeAnimation;
    this.metrics.droppedRenderFrames = this.droppedFrames;
    this.healthMonitor.recordFrame(frameTimeMs, droppedThisFrame);
    try {
      this.render(time, frameTimeMs / 1_000);
      this.consecutiveRenderFailures = 0;
      this.lastRenderedAt = time;
    } catch (error) {
      this.consecutiveRenderFailures += 1;
      if (this.consecutiveRenderFailures > this.maxConsecutiveRenderFailures) {
        this.healthMonitor.recordFatalError();
        this.running = false;
        this.frame = undefined;
        this.healthMonitor.stop();
        this.onFatalError?.(error);
        return;
      }
      this.healthMonitor.recordRecoveryAttempt();
    }
    this.schedule(generation);
  }
}
