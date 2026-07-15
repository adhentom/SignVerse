import { GlbAdapter } from './adapters/GlbAdapter';
import { LottieAdapter } from './adapters/LottieAdapter';
import { SvgSequenceAdapter } from './adapters/SvgSequenceAdapter';
import type { AssetFormat, Renderer } from './types';
import { DEFAULT_AVATAR, type AvatarProfile } from './avatarProfiles';

export function createRenderer(format: AssetFormat, profile: AvatarProfile = DEFAULT_AVATAR): Renderer {
  if (format === 'lottie') return new LottieAdapter();
  if (format === 'svg-sequence') return new SvgSequenceAdapter();
  return new GlbAdapter(profile, format === 'vrm');
}
