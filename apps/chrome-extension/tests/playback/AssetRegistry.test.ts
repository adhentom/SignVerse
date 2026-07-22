import { describe, expect, it } from 'vitest';
import { AssetRegistry } from '../../playback/AssetRegistry';

describe('AssetRegistry', () => {
  it('ships with no third-party dataset assets in the public release', () => {
    const registry = new AssetRegistry();

    expect(registry.list()).toEqual([]);
    expect(registry.lookup('dataset-number-one-v1')).toBeUndefined();
    expect(registry.lookupGloss('computer')).toBeUndefined();
    expect(registry.lookup('missing')).toBeUndefined();
  });
});
