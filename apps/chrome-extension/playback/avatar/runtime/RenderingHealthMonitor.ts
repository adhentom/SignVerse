import type { RenderingHealthDiagnostics } from '../../types';
import {
  detectBrowserCapabilities,
  estimatedBrowserMemoryUsage,
} from './BrowserCapabilities';
import {
  avatarRuntimeResourcePolicy,
  type RuntimeResourcePolicy,
} from './RuntimeResourcePolicy';

export interface RenderingHealthMonitorOptions {
  capacity?: number;
  now?: () => number;
  resourcePolicy?: RuntimeResourcePolicy;
  schedulerKind?: RenderingHealthDiagnostics['frameScheduler'];
}

export class RenderingHealthMonitor {
  private readonly samples: Float64Array;
  private readonly now: () => number;
  private readonly resourcePolicy: RuntimeResourcePolicy;
  private schedulerKind: RenderingHealthDiagnostics['frameScheduler'];
  private sampleCount = 0;
  private sampleIndex = 0;
  private renderedFrames = 0;
  private droppedFrames = 0;
  private skippedFrames = 0;
  private recoveryAttempts = 0;
  private fatalErrors = 0;
  private startedAt = 0;
  private stoppedAt?: number;

  constructor(options: RenderingHealthMonitorOptions = {}) {
    this.samples = new Float64Array(Math.max(8, Math.floor(options.capacity ?? 240)));
    this.now = options.now ?? (() => (
      typeof performance === 'undefined' ? Date.now() : performance.now()
    ));
    this.resourcePolicy = options.resourcePolicy ?? avatarRuntimeResourcePolicy;
    this.schedulerKind = options.schedulerKind ?? 'animation-frame';
    this.start();
  }

  start(schedulerKind = this.schedulerKind): void {
    this.schedulerKind = schedulerKind;
    this.startedAt = this.now();
    this.stoppedAt = undefined;
  }

  stop(): void {
    this.stoppedAt ??= this.now();
  }

  recordFrame(frameTimeMs: number, droppedFrames = 0): void {
    const finiteFrameTime = Number.isFinite(frameTimeMs) ? Math.max(0, frameTimeMs) : 0;
    this.samples[this.sampleIndex] = finiteFrameTime;
    this.sampleIndex = (this.sampleIndex + 1) % this.samples.length;
    this.sampleCount = Math.min(this.samples.length, this.sampleCount + 1);
    this.renderedFrames += 1;
    this.droppedFrames += Math.max(0, Math.floor(droppedFrames));
  }

  recordSkippedFrame(): void {
    this.skippedFrames += 1;
  }

  recordRecoveryAttempt(): void {
    this.recoveryAttempts += 1;
  }

  recordFatalError(): void {
    this.fatalErrors += 1;
  }

  snapshot(): RenderingHealthDiagnostics {
    const ordered = Array.from(this.samples.slice(0, this.sampleCount))
      .sort((left, right) => left - right);
    const totalFrameTime = ordered.reduce((sum, value) => sum + value, 0);
    const averageFrameTime = ordered.length === 0 ? 0 : totalFrameTime / ordered.length;
    const totalExpectedFrames = this.renderedFrames + this.droppedFrames;
    const memory = estimatedBrowserMemoryUsage();
    return Object.freeze({
      averageFps: averageFrameTime <= 0 ? 0 : 1000 / averageFrameTime,
      frameTimeDistributionMs: Object.freeze({
        p50: percentile(ordered, 0.5),
        p95: percentile(ordered, 0.95),
        p99: percentile(ordered, 0.99),
        maximum: ordered.at(-1) ?? 0,
      }),
      droppedFramePercentage: totalExpectedFrames === 0
        ? 0
        : this.droppedFrames * 100 / totalExpectedFrames,
      memoryUsageEstimateBytes: memory.bytes,
      memoryEstimateSource: memory.source,
      cacheHitRatio: 0,
      assetLoadLatencyMs: 0,
      renderLoopUptimeMs: Math.max(0, (this.stoppedAt ?? this.now()) - this.startedAt),
      intentionallySkippedFrames: this.skippedFrames,
      recoveryAttempts: this.recoveryAttempts,
      fatalErrorCount: this.fatalErrors,
      resourceMode: this.resourcePolicy.mode,
      browserFamily: detectBrowserCapabilities().family,
      frameScheduler: this.schedulerKind,
    });
  }
}

function percentile(sorted: number[], ratio: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index]!;
}
