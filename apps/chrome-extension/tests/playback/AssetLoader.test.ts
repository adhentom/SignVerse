import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssetLoader } from '../../playback/AssetLoader';
import { RuntimeResourcePolicy } from '../../playback/avatar/runtime';
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

function assetWithId(id: string): SignAsset {
  return {
    ...asset,
    asset_id: id,
    source: `avatar/${id}.json`,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('AssetLoader', () => {
  it('loads and reuses a cached animation', async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async () => (
      new Response(JSON.stringify({ layers: [] }), { status: 200 })
    ));
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

  it('does not fetch original signer media when a managed avatar clip exists', async () => {
    const request = vi.fn<typeof fetch>();
    const loader = new AssetLoader(request);
    const managed = {
      ...asset,
      format: 'mp4' as const,
      source: 'signs/source-signer.mp4',
      metadata: { avatar_clip: 'animations/retargeted.json' },
    };

    const loaded = await loader.load(managed);

    expect(request).not.toHaveBeenCalled();
    expect(loaded.data).toEqual({ managedBy: 'avatar-asset-manager' });
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

  it('uses bounded least-recently-used caching and reports exact cache diagnostics', async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async (source) => (
      new Response(JSON.stringify({ source: String(source) }), { status: 200 })
    ));
    const loader = new AssetLoader(request, 5_000, { capacity: 2 });
    const first = assetWithId('first');
    const second = assetWithId('second');
    const third = assetWithId('third');

    await loader.load(first);
    await loader.load(second);
    await loader.load(first);
    await loader.load(third);

    expect(loader.diagnostics()).toMatchObject({
      cacheEntries: 2,
      cacheCapacity: 2,
      cacheHits: 1,
      cacheMisses: 3,
      cacheEvictions: 1,
      cacheHitRatio: 0.25,
      activeLoads: 0,
      disposed: false,
    });

    await loader.load(second);
    expect(request).toHaveBeenCalledTimes(4);
    expect(loader.diagnostics()).toMatchObject({
      cacheEntries: 2,
      cacheMisses: 4,
      cacheEvictions: 2,
      cacheHitRatio: 0.2,
    });
    loader.dispose();
  });

  it('never evicts in-flight assets even when they temporarily exceed capacity', async () => {
    const responses = new Map<string, (response: Response) => void>();
    const request = vi.fn<typeof fetch>((source) => new Promise<Response>((resolve) => {
      responses.set(String(source), resolve);
    }));
    const loader = new AssetLoader(request, 5_000, { capacity: 1 });
    const first = assetWithId('pending-first');
    const second = assetWithId('pending-second');
    const firstLoad = loader.load(first);
    const secondLoad = loader.load(second);

    expect(loader.diagnostics()).toMatchObject({
      cacheEntries: 2,
      cacheCapacity: 1,
      activeLoads: 2,
      cacheEvictions: 0,
    });

    responses.get(first.source)?.(
      new Response(JSON.stringify({ id: first.asset_id }), { status: 200 }),
    );
    await firstLoad;
    expect(loader.diagnostics()).toMatchObject({
      cacheEntries: 1,
      activeLoads: 1,
      cacheEvictions: 1,
    });

    responses.get(second.source)?.(
      new Response(JSON.stringify({ id: second.asset_id }), { status: 200 }),
    );
    await secondLoad;
    expect(loader.diagnostics()).toMatchObject({
      cacheEntries: 1,
      activeLoads: 0,
    });
    loader.dispose();
  });

  it('uses the selected resource policy for capacity without changing loaded data', async () => {
    const policy = new RuntimeResourcePolicy();
    policy.setMode('reduced');
    const request = vi.fn<typeof fetch>().mockImplementation(async () => (
      new Response(JSON.stringify({ layers: [] }), { status: 200 })
    ));
    const loader = new AssetLoader(request, 5_000, { resourcePolicy: policy });

    for (let index = 0; index < 17; index += 1) {
      await loader.load(assetWithId(`reduced-${index}`));
    }

    expect(loader.diagnostics()).toMatchObject({
      cacheCapacity: 16,
      cacheEntries: 16,
      cacheMisses: 17,
      cacheEvictions: 1,
    });
    loader.dispose();
  });

  it('cleans reusable entries deterministically without retaining active loads', async () => {
    const loader = new AssetLoader(vi.fn<typeof fetch>().mockImplementation(async () => (
      new Response(JSON.stringify({ layers: [] }), { status: 200 })
    )), 5_000, { capacity: 4 });

    await loader.load(assetWithId('one'));
    await loader.load(assetWithId('two'));
    loader.cleanup();

    expect(loader.diagnostics()).toMatchObject({
      cacheEntries: 0,
      activeLoads: 0,
      cacheEvictions: 2,
    });
    loader.dispose();
  });

  it('aborts pending loads, clears timers, and becomes unusable after disposal', async () => {
    vi.useFakeTimers();
    const request = vi.fn<typeof fetch>().mockImplementation((_source, init) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      })
    ));
    const loader = new AssetLoader(request, 10_000);
    const pending = loader.load(assetWithId('pending'));

    expect(loader.diagnostics().activeLoads).toBe(1);
    expect(vi.getTimerCount()).toBe(1);
    loader.dispose();

    await expect(pending).rejects.toMatchObject({ code: 'timeout' });
    expect(loader.diagnostics()).toMatchObject({
      cacheEntries: 0,
      activeLoads: 0,
      disposed: true,
    });
    expect(vi.getTimerCount()).toBe(0);
    await expect(loader.load(assetWithId('after-dispose'))).rejects.toThrow('disposed');
  });

  it('drops failed cache entries so a subsequent load can recover', async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{corrupted', { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ layers: [] }), { status: 200 }));
    const loader = new AssetLoader(request);
    const retryable = assetWithId('retryable');

    await expect(loader.load(retryable)).rejects.toMatchObject({ code: 'corrupted' });
    expect(loader.diagnostics().cacheEntries).toBe(0);
    await expect(loader.load(retryable)).resolves.toMatchObject({ metadata: retryable });

    expect(request).toHaveBeenCalledTimes(2);
    expect(loader.diagnostics()).toMatchObject({
      cacheEntries: 1,
      cacheHits: 0,
      cacheMisses: 2,
      activeLoads: 0,
    });
    loader.dispose();
  });

  it('records deterministic bounded load-latency samples', async () => {
    const timestamps = [100, 125, 200, 235];
    vi.spyOn(performance, 'now').mockImplementation(() => timestamps.shift() ?? 235);
    const loader = new AssetLoader(vi.fn<typeof fetch>().mockImplementation(async () => (
      new Response(JSON.stringify({ layers: [] }), { status: 200 })
    )));

    await loader.load(assetWithId('latency-one'));
    await loader.load(assetWithId('latency-two'));

    expect(loader.diagnostics().averageLoadTimeMs).toBe(30);
    loader.dispose();
  });

  it('does not reuse stale data when an asset id points to a new version or source', async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async (source) => (
      new Response(JSON.stringify({ source: String(source) }), { status: 200 })
    ));
    const loader = new AssetLoader(request);
    const first = assetWithId('versioned');
    const replacement = {
      ...first,
      version: '2',
      source: 'avatar/versioned-v2.json',
    };

    await loader.load(first);
    const loaded = await loader.load(replacement);

    expect(request).toHaveBeenCalledTimes(2);
    expect(loaded.data).toEqual({ source: 'avatar/versioned-v2.json' });
    loader.dispose();
  });

  it('bounds preloading and prioritizes the next sign over queued background work', async () => {
    const policy = new RuntimeResourcePolicy();
    policy.setMode('reduced');
    const responses = new Map<string, (response: Response) => void>();
    const request = vi.fn<typeof fetch>((source) => new Promise<Response>((resolve) => {
      responses.set(String(source), resolve);
    }));
    const loader = new AssetLoader(request, 5_000, { resourcePolicy: policy });
    const background = assetWithId('background');
    const next = assetWithId('next');
    const frequent = assetWithId('frequent');

    loader.preload(background, 'background');
    loader.preload(frequent, 'frequent');
    loader.preload(next, 'next');
    expect(loader.diagnostics()).toMatchObject({
      activePreloads: 1,
      queuedPreloads: 2,
    });

    responses.get(background.source)?.(
      new Response(JSON.stringify({ id: background.asset_id }), { status: 200 }),
    );
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(request.mock.calls[1]?.[0]).toBe(next.source);

    responses.get(next.source)?.(
      new Response(JSON.stringify({ id: next.asset_id }), { status: 200 }),
    );
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(3));
    expect(request.mock.calls[2]?.[0]).toBe(frequent.source);

    responses.get(frequent.source)?.(
      new Response(JSON.stringify({ id: frequent.asset_id }), { status: 200 }),
    );
    await vi.waitFor(() => expect(loader.diagnostics()).toMatchObject({
      activePreloads: 0,
      queuedPreloads: 0,
    }));
    loader.dispose();
  });
});
