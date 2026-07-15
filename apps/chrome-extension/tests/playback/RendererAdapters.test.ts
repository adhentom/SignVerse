import { describe, expect, it } from 'vitest';
import { createRenderer } from '../../playback/RendererFactory';

describe('renderer adapters', () => {
  it('selects Lottie and SVG implementations behind the shared interface', () => {
    expect(createRenderer('lottie').format).toBe('lottie');
    expect(createRenderer('svg-sequence').format).toBe('svg-sequence');
  });

  it('keeps GLB as an explicit unsupported adapter', async () => {
    const renderer = createRenderer('glb');
    await expect(renderer.mount(document.createElement('div'), {
      metadata: {
        asset_id: 'glb-test', token_id: 'test', display_name: 'Test', format: 'glb',
        source: 'test.glb', duration: 1, license: 'test', version: '1', review_status: 'draft',
      },
      data: new ArrayBuffer(0),
    }, false)).rejects.toThrow('GLB rendering is not enabled');
  });
});
