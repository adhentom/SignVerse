import { AvatarAnimationEngine, type AvatarClip } from '../avatar/AvatarAnimationEngine';
import {
  AvatarAssetManager,
  avatarAssetManagerFor,
  type AvatarAnimationLease,
  type AvatarVisualLease,
} from '../avatar/assets';
import type { LoadedAsset, Renderer, RenderingDiagnostics } from '../types';
import type { AvatarPoseSnapshot } from '../types';
import type { PlaybackItem } from '../../shared/interpretation';
import { DEFAULT_AVATAR, type AvatarProfile } from '../avatarProfiles';
import { isNativeApproved } from '../nativeReview';
import { attachSourceAnimation, sourceAnimationId } from '../avatar/motion';
import { AvatarRuntimeCoordinator } from '../avatar/runtime';
import { runtimeDiagnostic } from '../../shared/runtimeDiagnostics';

export class Avatar2DAdapter implements Renderer {
  readonly format = 'svg-sequence' as const;
  private engine?: AvatarAnimationEngine;
  private playbackLogged = false;
  private transitionSource?: AvatarPoseSnapshot;
  private playbackContext?: PlaybackItem;
  private animationLease?: AvatarAnimationLease;
  private visualLease?: AvatarVisualLease;
  private transitionSourceAnimationId?: string;
  private assetTransitionMs?: number;
  private readonly assets: AvatarAssetManager;
  private readonly runtime: AvatarRuntimeCoordinator;
  private mountGeneration = 0;

  constructor(
    request: typeof fetch = fetch,
    private readonly profile: AvatarProfile = DEFAULT_AVATAR,
    assets?: AvatarAssetManager,
  ) {
    this.assets = assets ?? avatarAssetManagerFor(request);
    this.runtime = new AvatarRuntimeCoordinator(this.assets);
    void this.runtime.warmUp();
  }

  async mount(target: HTMLElement, asset: LoadedAsset, reducedMotion: boolean): Promise<void> {
    this.destroy();
    const generation = this.mountGeneration;
    if (asset.metadata.native_review?.status === 'rejected') {
      throw new Error(`Avatar animation for ${asset.metadata.display_name} failed native ISL review.`);
    }
    const animationLease = await this.assets.acquireAnimation({
      source: asset.metadata.metadata.avatar_clip,
      id: typeof asset.metadata.metadata.avatar_clip_id === 'string'
        ? asset.metadata.metadata.avatar_clip_id
        : undefined,
      integrity: typeof asset.metadata.metadata.avatar_clip_integrity === 'string'
        ? asset.metadata.metadata.avatar_clip_integrity
        : undefined,
      fallbackSource: typeof asset.metadata.metadata.avatar_fallback_clip === 'string'
        ? asset.metadata.metadata.avatar_fallback_clip
        : undefined,
    });
    if (generation !== this.mountGeneration) {
      animationLease.release();
      return;
    }
    this.animationLease = animationLease;
    const clip = animationLease.clip;
    const approved = isNativeApproved(asset.metadata);
    const motionProfile = animationLease.metadata?.defaultBlendProfile ??
      (typeof asset.metadata.metadata.motion_profile === 'string'
        ? asset.metadata.metadata.motion_profile
        : undefined);
    const requestedTransition = animationLease.metadata?.transitionProfile ??
      (typeof asset.metadata.metadata.transition_profile === 'string'
        ? asset.metadata.metadata.transition_profile
        : 'default');
    const transition = this.assets.transition(requestedTransition) ??
      this.assets.transition('default');
    try {
      this.mountAvatar(
        target,
        reducedMotion,
        clip,
        approved ? 'approved' : 'preview',
        motionProfile,
        transition?.id,
        transition?.duration,
      );
    } catch (error) {
      this.animationLease?.release();
      this.animationLease = undefined;
      throw error;
    }
    const handshape = this.assets.resolveHandshape(asset.metadata.handshape)?.rendererShapeId;
    if (handshape) {
      this.engine?.setHandShape('left', handshape);
      this.engine?.setHandShape('right', handshape);
    }
    runtimeDiagnostic('svg_avatar_clip_loaded', {
      assetId: asset.metadata.asset_id,
      clipId: clip.id,
      keyframeCount: clip.keyframes.length,
      reviewMode: approved ? 'approved' : 'preview',
    });
  }

  mountIdle(target: HTMLElement, reducedMotion: boolean): void {
    this.destroy();
    this.mountAvatar(target, reducedMotion);
  }

  play(speed: number): void {
    if (!this.playbackLogged) {
      runtimeDiagnostic('avatar_animation_engine_started', {
        renderer: this.engine ? 'svg-avatar' : 'unmounted',
        speed,
      });
      this.playbackLogged = true;
    }
    this.engine?.play(speed);
  }
  pause(): void { this.engine?.pause(); }
  resume(speed: number): void { this.engine?.resume(speed); }
  stop(): void { this.engine?.stop(); }
  seek(progress: number): void { this.engine?.seek(progress); }
  setPlaybackContext(item: PlaybackItem): void {
    this.playbackContext = item;
    this.engine?.configureTransition(
      item.transition_ms ?? this.assetTransitionMs,
      item.duration * 1_000,
    );
    this.engine?.setNonManualMarkers(item.non_manual_markers ?? []);
  }
  setTransitionSource(pose: AvatarPoseSnapshot): void {
    this.transitionSource = pose;
    this.transitionSourceAnimationId = sourceAnimationId(pose);
  }
  capturePose(): AvatarPoseSnapshot {
    if (!this.engine) return {};
    return attachSourceAnimation(this.engine.snapshotPose(), this.engine.activeAnimationId);
  }
  getRenderingDiagnostics(): RenderingDiagnostics {
    const rendering = this.engine?.diagnostics() ?? {
      fps: 0,
      frameTimeMs: 0,
      animationQueueDepth: 0,
      blendDurationMs: 0,
      activeAnimation: 'idle',
      droppedRenderFrames: 0,
    };
    return this.runtime.decorateDiagnostics(rendering);
  }
  destroy(): void {
    this.mountGeneration += 1;
    this.engine?.dispose();
    this.engine = undefined;
    this.animationLease?.release();
    this.animationLease = undefined;
    this.visualLease?.release();
    this.visualLease = undefined;
    if (!this.transitionSource) this.transitionSourceAnimationId = undefined;
    this.assetTransitionMs = undefined;
    this.playbackLogged = false;
    this.runtime.afterRendererRelease();
  }
  dispose(): void { this.destroy(); }

  private mountAvatar(
    target: HTMLElement,
    reducedMotion: boolean,
    clip?: AvatarClip,
    reviewMode: 'approved' | 'preview' = 'approved',
    motionProfile?: string,
    transitionHint?: string,
    transitionDurationMs?: number,
  ): void {
    this.visualLease?.release();
    const visualLease = this.assets.acquireVisual(this.profile);
    if (visualLease.asset.kind !== 'svg' ||
        !(visualLease.asset.resource instanceof SVGSVGElement)) {
      visualLease.release();
      throw new Error('SVG avatar visual asset is unavailable.');
    }
    this.visualLease = visualLease;
    const svg = visualLease.asset.resource;
    svg.dataset.islReviewMode = reviewMode;
    target.replaceChildren(svg);
    try {
      this.engine = new AvatarAnimationEngine(svg, clip, reducedMotion);
    } catch (error) {
      this.visualLease.release();
      this.visualLease = undefined;
      throw error;
    }
    this.assetTransitionMs = transitionDurationMs;
    this.engine.configureMotion(motionProfile, transitionHint);
    this.engine.configureTransition(
      this.playbackContext?.transition_ms ?? this.assetTransitionMs,
      this.playbackContext ? this.playbackContext.duration * 1_000 : undefined,
    );
    if (this.transitionSource) {
      this.engine.setTransitionSource(
        this.transitionSource,
        this.transitionSourceAnimationId,
      );
    }
    this.engine.setNonManualMarkers(this.playbackContext?.non_manual_markers ?? []);
    this.transitionSource = undefined;
    this.transitionSourceAnimationId = undefined;
    this.engine.play();
  }
}
