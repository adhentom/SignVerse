import type { PlaybackItem } from '../../../shared/interpretation';
import type {
  AvatarPoseSnapshot,
  LoadedAsset,
  Renderer,
  RenderingDiagnostics,
} from '../../types';
import { RenderingHealthMonitor } from './RenderingHealthMonitor';

export interface RendererSupervisorOptions {
  maxMountRetries?: number;
  healthMonitor?: RenderingHealthMonitor;
}

type PlaybackIntent = 'paused' | 'playing';

/**
 * Adds bounded recovery and context-loss handling around an existing renderer.
 *
 * The supervisor intentionally implements the unchanged Renderer contract so
 * playback scheduling and rendering implementations remain unaware of it.
 */
export class RendererSupervisor implements Renderer {
  readonly format;
  private target?: HTMLElement;
  private asset?: LoadedAsset;
  private reducedMotion = false;
  private playbackContext?: PlaybackItem;
  private transitionSource?: AvatarPoseSnapshot;
  private playbackIntent: PlaybackIntent = 'paused';
  private playbackSpeed = 1;
  private progress = 0;
  private generation = 0;
  private restart?: Promise<void>;
  private contextCanvas?: HTMLCanvasElement;
  private readonly maxMountRetries: number;
  private readonly healthMonitor: RenderingHealthMonitor;

  constructor(
    private readonly renderer: Renderer,
    options: RendererSupervisorOptions = {},
  ) {
    this.format = renderer.format;
    this.maxMountRetries = Math.max(0, Math.floor(options.maxMountRetries ?? 1));
    this.healthMonitor = options.healthMonitor ?? new RenderingHealthMonitor();
  }

  async mount(
    target: HTMLElement,
    asset: LoadedAsset,
    reducedMotion: boolean,
  ): Promise<void> {
    this.target = target;
    this.asset = asset;
    this.reducedMotion = reducedMotion;
    this.playbackIntent = 'paused';
    this.progress = 0;
    const generation = ++this.generation;
    await this.mountWithRecovery(generation, false);
  }

  play(speed: number): void {
    this.playbackSpeed = speed;
    this.playbackIntent = 'playing';
    this.invokeOrRecover(() => this.renderer.play(speed));
  }

  pause(): void {
    this.playbackIntent = 'paused';
    this.invokeOrRecover(() => this.renderer.pause());
  }

  seek(progress: number): void {
    this.progress = Math.max(0, Math.min(1, progress));
    this.invokeOrRecover(() => this.renderer.seek(this.progress));
  }

  setPlaybackContext(item: PlaybackItem): void {
    this.playbackContext = item;
    this.invokeOrRecover(() => this.renderer.setPlaybackContext?.(item));
  }

  setTransitionSource(pose: AvatarPoseSnapshot): void {
    this.transitionSource = pose;
    this.invokeOrRecover(() => this.renderer.setTransitionSource?.(pose));
  }

  capturePose(): AvatarPoseSnapshot {
    try {
      return this.renderer.capturePose?.() ?? {};
    } catch (error) {
      this.requestRecovery(error);
      return {};
    }
  }

  getRenderingDiagnostics(): RenderingDiagnostics {
    const rendering = this.renderer.getRenderingDiagnostics?.() ?? EMPTY_RENDERING_DIAGNOSTICS;
    const supervisorHealth = this.healthMonitor.snapshot();
    const rendererHealth = rendering.health;
    return {
      ...rendering,
      health: rendererHealth
        ? {
            ...rendererHealth,
            recoveryAttempts:
              rendererHealth.recoveryAttempts + supervisorHealth.recoveryAttempts,
            fatalErrorCount:
              rendererHealth.fatalErrorCount + supervisorHealth.fatalErrorCount,
          }
        : supervisorHealth,
    };
  }

  destroy(): void {
    this.generation += 1;
    this.detachContextListeners();
    this.renderer.destroy();
    this.healthMonitor.stop();
    this.target = undefined;
    this.asset = undefined;
    this.playbackContext = undefined;
    this.transitionSource = undefined;
    this.restart = undefined;
    this.playbackIntent = 'paused';
    this.progress = 0;
  }

  private async mountWithRecovery(
    generation: number,
    restoringPlayback: boolean,
  ): Promise<void> {
    const target = this.target;
    const asset = this.asset;
    if (!target || !asset) throw new Error('Renderer recovery state is unavailable.');
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxMountRetries; attempt += 1) {
      try {
        await this.renderer.mount(target, asset, this.reducedMotion);
        if (generation !== this.generation) {
          this.renderer.destroy();
          return;
        }
        this.attachContextListeners(target);
        if (restoringPlayback) this.restorePlaybackState();
        return;
      } catch (error) {
        lastError = error;
        this.detachContextListeners();
        this.renderer.destroy();
        target.replaceChildren();
        if (generation !== this.generation) return;
        if (!isTransientRendererError(error) || attempt === this.maxMountRetries) {
          this.healthMonitor.recordFatalError();
          throw error;
        }
        this.healthMonitor.recordRecoveryAttempt();
      }
    }
    throw lastError;
  }

  private restorePlaybackState(): void {
    if (this.playbackContext) {
      this.renderer.setPlaybackContext?.(this.playbackContext);
    }
    if (this.transitionSource) {
      this.renderer.setTransitionSource?.(this.transitionSource);
    }
    this.renderer.seek(this.progress);
    if (this.playbackIntent === 'playing' && !this.reducedMotion) {
      this.renderer.play(this.playbackSpeed);
    } else {
      this.renderer.pause();
    }
  }

  private invokeOrRecover(operation: () => void): void {
    try {
      operation();
    } catch (error) {
      this.requestRecovery(error);
    }
  }

  private requestRecovery(error?: unknown): void {
    if (this.restart || !this.target || !this.asset) return;
    if (error !== undefined && !isTransientRendererError(error)) {
      this.healthMonitor.recordFatalError();
      return;
    }
    this.healthMonitor.recordRecoveryAttempt();
    const generation = ++this.generation;
    this.restart = Promise.resolve()
      .then(() => {
        this.detachContextListeners();
        this.renderer.destroy();
        this.target?.replaceChildren();
        return this.mountWithRecovery(generation, true);
      })
      .catch(() => undefined)
      .finally(() => {
        if (generation === this.generation) this.restart = undefined;
      });
  }

  private attachContextListeners(target: HTMLElement): void {
    this.detachContextListeners();
    const canvas = target.querySelector('canvas');
    if (!(canvas instanceof HTMLCanvasElement)) return;
    this.contextCanvas = canvas;
    canvas.addEventListener('webglcontextlost', this.onContextLost);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  private detachContextListeners(): void {
    this.contextCanvas?.removeEventListener('webglcontextlost', this.onContextLost);
    this.contextCanvas?.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.contextCanvas = undefined;
  }

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    try {
      this.renderer.pause();
    } catch {
      // The restored mount is authoritative.
    }
  };

  private readonly onContextRestored = (): void => {
    this.requestRecovery();
  };
}

const NON_RETRYABLE_ERROR = /\b(?:corrupt(?:ed|ion)?|integrity|native isl review|not reviewed|validated|unavailable|not found|unsupported|could not be decoded)\b/iu;

export function isTransientRendererError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return !NON_RETRYABLE_ERROR.test(message);
}

const EMPTY_RENDERING_DIAGNOSTICS: RenderingDiagnostics = Object.freeze({
  fps: 0,
  frameTimeMs: 0,
  animationQueueDepth: 0,
  blendDurationMs: 0,
  activeAnimation: 'idle',
  droppedRenderFrames: 0,
});
