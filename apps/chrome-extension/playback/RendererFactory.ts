import { GlbAdapter } from './adapters/GlbAdapter';
import { LottieAdapter } from './adapters/LottieAdapter';
import { SvgSequenceAdapter } from './adapters/SvgSequenceAdapter';
import type { AssetFormat, Renderer } from './types';

export function createRenderer(format: AssetFormat): Renderer {
  if (format === 'lottie') return new LottieAdapter();
  if (format === 'svg-sequence') return new SvgSequenceAdapter();
  return new GlbAdapter();
}
