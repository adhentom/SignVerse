import { GlbAdapter } from './adapters/GlbAdapter';
import { LottieAdapter } from './adapters/LottieAdapter';
import { Mp4Adapter } from './adapters/Mp4Adapter';
import { SvgSequenceAdapter } from './adapters/SvgSequenceAdapter';
import { Avatar2DAdapter } from './adapters/Avatar2DAdapter';
import { hasAvatarClipSource } from './avatar/avatarClips';
import type { AssetFormat, Renderer, SignAsset } from './types';
import { DEFAULT_AVATAR, type AvatarProfile } from './avatarProfiles';

export function createRenderer(format: AssetFormat, profile: AvatarProfile = DEFAULT_AVATAR): Renderer {
  if (format === 'lottie') return new LottieAdapter();
  if (format === 'svg-sequence') return new SvgSequenceAdapter();
  if (format === 'mp4') return new Mp4Adapter();
  return new GlbAdapter(profile, format === 'vrm');
}

export function createRendererForAsset(asset: SignAsset, profile: AvatarProfile = DEFAULT_AVATAR): Renderer {
  // Dataset videos are landmark/reference sources, never the public interpreter.
  // MP4-backed assets enter the avatar adapter so only a reviewed retargeted clip
  // can play in the floating SignVerse renderer.
  const avatarPrimary = asset.format === 'mp4' || hasAvatarClipSource(asset.metadata.avatar_clip);
  console.info('[SignVerse] renderer_selected', {
    assetId: asset.asset_id,
    renderer: avatarPrimary ? 'svg-avatar' : asset.format,
    hasAvatarClip: hasAvatarClipSource(asset.metadata.avatar_clip),
  });
  return avatarPrimary ? new Avatar2DAdapter(fetch, profile) : createRenderer(asset.format, profile);
}
