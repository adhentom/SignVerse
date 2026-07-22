import { describe, expect, it, vi } from 'vitest';
import { AssetLoader } from '../../playback/AssetLoader';
import type { SignAsset } from '../../playback/types';

const asset: SignAsset = {
  asset_id: 'asset-test',
  token_id: 'test',
  canonical_gloss: 'TEST',
  word: 'test',
  synonyms: [],
  language: 'ISL',
  category: 'test',
  display_name: 'Test',
  format: 'lottie',
  file_path: 'avatar/test.json',
  source: 'avatar/test.json',
  duration: 1,
  license: 'test',
  version: '1',
  review_status: 'draft',
  transition: 'cross-fade',
  handshape: 'pending',
  orientation: 'pending',
  facial_expression: 'pending',
  fallback: 'fingerspell',
  metadata: {},
};

describe('AssetLoader', () => {
  it('loads and reuses a cached animation', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ layers: [] }), { status: 200 }),
    );
    const loader = new AssetLoader(request);

    await expect(loader.load(asset)).resolves.toMatchObject({ metadata: asset });
    await loader.load(asset);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('loads dataset MP4 assets as blobs', async () => {
    const video = { ...asset, format: 'mp4' as const, source: 'signs/number-one.mp4' };
    const loader = new AssetLoader(vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new Uint8Array([0, 1, 2]), { status: 200, headers: { 'Content-Type': 'video/mp4' } }),
    ));

    const loaded = await loader.load(video);
    expect(loaded.metadata).toBe(video);
    expect(loaded.data).toMatchObject({ size: 3, type: 'video/mp4' });
  });

  it('reports missing and corrupted assets', async () => {
    const missing = new AssetLoader(vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 404 })));
    const corrupted = new AssetLoader(vi.fn<typeof fetch>().mockResolvedValue(new Response('bad', { status: 200 })));

    await expect(missing.load(asset)).rejects.toMatchObject({ code: 'missing' });
    await expect(corrupted.load(asset)).rejects.toMatchObject({ code: 'corrupted' });
  });

  it('reports loading timeouts', async () => {
    const request = vi.fn<typeof fetch>().mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const loader = new AssetLoader(request, 1);

    await expect(loader.load(asset)).rejects.toMatchObject({ code: 'timeout' });
  });
});
