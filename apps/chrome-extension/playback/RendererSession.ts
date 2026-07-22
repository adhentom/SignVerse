import type { PlaybackItem } from '../shared/interpretation';
import type { AvatarPoseSnapshot, LoadedAsset, Renderer } from './types';

export interface RendererLifecycle {
  initialize(target: HTMLElement, reducedMotion: boolean): void;
  load(asset: LoadedAsset): Promise<void>;
  play(speed: number): void;
  pause(): void;
  resume(speed: number): void;
  stop(): void;
  seek(progress: number): void;
  setPlaybackContext(item: PlaybackItem): void;
  setTransitionSource(pose: AvatarPoseSnapshot): void;
  capturePose(): AvatarPoseSnapshot;
  dispose(): void;
}

/** Normalizes every media implementation to the public renderer lifecycle. */
export class RendererSession implements RendererLifecycle {
  private target?: HTMLElement;
  private reducedMotion = false;

  constructor(private readonly renderer: Renderer) {}

  initialize(target: HTMLElement, reducedMotion: boolean): void {
    this.target = target;
    this.reducedMotion = reducedMotion;
  }

  async load(asset: LoadedAsset): Promise<void> {
    if (!this.target) throw new Error('Renderer must be initialized before loading an asset.');
    await this.renderer.mount(this.target, asset, this.reducedMotion);
  }

  play(speed: number): void { this.renderer.play(speed); }
  pause(): void { this.renderer.pause(); }
  resume(speed: number): void { this.renderer.play(speed); }
  stop(): void { this.renderer.pause(); this.renderer.seek(0); }
  seek(progress: number): void { this.renderer.seek(progress); }
  setPlaybackContext(item: PlaybackItem): void { this.renderer.setPlaybackContext?.(item); }
  setTransitionSource(pose: AvatarPoseSnapshot): void {
    this.renderer.setTransitionSource?.(pose);
  }
  capturePose(): AvatarPoseSnapshot { return this.renderer.capturePose?.() ?? {}; }
  dispose(): void { this.renderer.destroy(); this.target = undefined; }
}
