import { describe, expect, it } from 'vitest';
import { createRenderer } from '../../playback/RendererFactory';

describe('renderer adapters', () => {
  it('selects Lottie and SVG implementations behind the shared interface', () => {
    expect(createRenderer('lottie').format).toBe('lottie');
    expect(createRenderer('svg-sequence').format).toBe('svg-sequence');
  });

  it('selects the shared 3D renderer for GLB and VRM assets', () => {
    expect(createRenderer('glb').format).toBe('glb');
    expect(createRenderer('vrm').format).toBe('glb');
  });
});
