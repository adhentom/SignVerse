import type { LoadedAsset, SignAsset } from './types';

export class AssetLoadError extends Error {
  constructor(readonly code: 'missing' | 'timeout' | 'corrupted', message: string) {
    super(message);
    this.name = 'AssetLoadError';
  }
}

function assetUrl(source: string): string {
  if (/^https?:\/\//u.test(source)) return source;
  return typeof chrome === 'undefined' ? source : chrome.runtime.getURL(source);
}

export class AssetLoader {
  private readonly cache = new Map<string, Promise<LoadedAsset>>();

  constructor(
    private readonly request: typeof fetch = fetch,
    private readonly timeoutMs = 5_000,
  ) {}

  load(asset: SignAsset): Promise<LoadedAsset> {
    const cached = this.cache.get(asset.asset_id);
    if (cached) return cached;
    const pending = this.fetchAsset(asset).catch((error) => {
      this.cache.delete(asset.asset_id);
      throw error;
    });
    this.cache.set(asset.asset_id, pending);
    return pending;
  }

  preload(asset: SignAsset | undefined): void {
    if (asset) void this.load(asset).catch(() => undefined);
  }

  private async fetchAsset(asset: SignAsset): Promise<LoadedAsset> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const request = this.request;
      const response = await request(assetUrl(asset.source), { signal: controller.signal });
      if (!response.ok) {
        throw new AssetLoadError('missing', `Animation asset ${asset.asset_id} was not found.`);
      }
      let data: unknown;
      try {
        data = asset.format === 'glb' || asset.format === 'vrm'
          ? await response.arrayBuffer()
          : await response.json();
      } catch {
        throw new AssetLoadError('corrupted', `Animation asset ${asset.asset_id} is corrupted.`);
      }
      if (!data || typeof data !== 'object') {
        throw new AssetLoadError('corrupted', `Animation asset ${asset.asset_id} is corrupted.`);
      }
      return { metadata: asset, data };
    } catch (error) {
      if (error instanceof AssetLoadError) throw error;
      if (controller.signal.aborted) {
        throw new AssetLoadError('timeout', `Animation asset ${asset.asset_id} timed out.`);
      }
      throw new AssetLoadError('missing', `Animation asset ${asset.asset_id} could not be loaded.`);
    } finally {
      window.clearTimeout(timeout);
    }
  }
}

export const signAssetLoader = new AssetLoader();
