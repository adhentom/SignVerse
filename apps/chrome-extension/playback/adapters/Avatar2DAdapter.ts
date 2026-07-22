import { AvatarAnimationEngine, type AvatarClip } from '../avatar/AvatarAnimationEngine';
import { loadAvatarClip } from '../avatar/avatarClips';
import { createSignVerseInterpreterSvg } from '../avatar/signVerseInterpreter/createSignVerseInterpreterSvg';
import type { LoadedAsset, Renderer } from '../types';
import type { AvatarPoseSnapshot } from '../types';
import type { PlaybackItem } from '../../shared/interpretation';
import { DEFAULT_AVATAR, type AvatarProfile } from '../avatarProfiles';
import { isNativeApproved } from '../nativeReview';

export class Avatar2DAdapter implements Renderer {
  readonly format = 'svg-sequence' as const;
  private engine?: AvatarAnimationEngine;
  private playbackLogged = false;
  private transitionSource?: AvatarPoseSnapshot;
  private playbackContext?: PlaybackItem;

  constructor(
    private readonly request: typeof fetch = fetch,
    private readonly profile: AvatarProfile = DEFAULT_AVATAR,
  ) {}

  async mount(target: HTMLElement, asset: LoadedAsset, reducedMotion: boolean): Promise<void> {
    this.destroy();
    if (asset.metadata.native_review?.status === 'rejected') {
      throw new Error(`Avatar animation for ${asset.metadata.display_name} failed native ISL review.`);
    }
    const clip = await loadAvatarClip(asset.metadata.metadata.avatar_clip, this.request);
    const approved = isNativeApproved(asset.metadata);
    this.mountAvatar(target, reducedMotion, clip, approved ? 'approved' : 'preview');
    this.engine?.setHandShape('left', asset.metadata.handshape);
    this.engine?.setHandShape('right', asset.metadata.handshape);
    console.info('[SignVerse] svg_avatar_clip_loaded', {
      assetId: asset.metadata.asset_id,
      clipId: clip.id,
      keyframeCount: clip.keyframes.length,
      reviewMode: approved ? 'approved' : 'preview',
    });
  }

  mountIdle(target: HTMLElement, reducedMotion: boolean): void {
    this.mountAvatar(target, reducedMotion);
  }

  play(speed: number): void {
    if (!this.playbackLogged) {
      console.info('[SignVerse] avatar_playback_started', {
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
    this.engine?.setNonManualMarkers(item.non_manual_markers ?? []);
  }
  setTransitionSource(pose: AvatarPoseSnapshot): void { this.transitionSource = pose; }
  capturePose(): AvatarPoseSnapshot { return this.engine?.snapshotPose() ?? {}; }
  destroy(): void {
    this.engine?.dispose();
    this.engine = undefined;
    this.playbackLogged = false;
  }
  dispose(): void { this.destroy(); }

  private mountAvatar(
    target: HTMLElement,
    reducedMotion: boolean,
    clip?: AvatarClip,
    reviewMode: 'approved' | 'preview' = 'approved',
  ): void {
    const svg = createSignVerseInterpreterSvg(this.profile);
    svg.dataset.islReviewMode = reviewMode;
    target.replaceChildren(svg);
    this.engine = new AvatarAnimationEngine(svg, clip, reducedMotion);
    if (this.transitionSource) this.engine.setTransitionSource(this.transitionSource);
    this.engine.setNonManualMarkers(this.playbackContext?.non_manual_markers ?? []);
    this.transitionSource = undefined;
    this.engine.play();
  }
}
