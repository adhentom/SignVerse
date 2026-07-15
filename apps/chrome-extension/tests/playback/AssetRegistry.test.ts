import { describe, expect, it } from 'vitest';
import { AssetRegistry } from '../../playback/AssetRegistry';

describe('AssetRegistry', () => {
  it('maps governed playback asset IDs to versioned render metadata', () => {
    const registry = new AssetRegistry();
    const asset = registry.lookup('asset-placeholder-hello');

    expect(asset).toMatchObject({
      token_id: 'greeting-hello',
      format: 'lottie',
      duration: 1.2,
      version: '1.0',
      review_status: 'draft',
    });
    expect(asset?.license).toContain('linguistic review pending');
    expect(registry.lookup('missing')).toBeUndefined();
  });
});
