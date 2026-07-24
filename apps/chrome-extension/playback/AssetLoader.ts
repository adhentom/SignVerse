import type { LoadedAsset, SignAsset } from './types';
import { avatarAssetManager } from './avatar/assets';
import { hasAvatarClipSource } from './avatar/avatarClips';
import {
  avatarRuntimeResourcePolicy,
  type RuntimeResourcePolicy,
} from './avatar/runtime';

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

interface AssetCacheEntry {
  promise: Promise<LoadedAsset>;
  pending: boolean;
}

export interface AssetLoaderOptions {
  capacity?: number;
  resourcePolicy?: RuntimeResourcePolicy;
}

export interface AssetLoaderDiagnostics {
  cacheEntries: number;
  cacheCapacity: number;
  cacheHits: number;
  cacheMisses: number;
  cacheEvictions: number;
  cacheHitRatio: number;
  averageLoadTimeMs: number;
  activeLoads: number;
  activePreloads: number;
  queuedPreloads: number;
  disposed: boolean;
}

export type AssetPreloadPriority = 'background' | 'frequent' | 'next';

interface PreloadRequest {
  asset: SignAsset;
  priority: number;
}

export class AssetLoader {
  private readonly cache = new Map<string, AssetCacheEntry>();
  private readonly controllers = new Set<AbortController>();
  private readonly loadTimes: number[] = [];
  private readonly resourcePolicy: RuntimeResourcePolicy;
  private readonly configuredCapacity?: number;
  private cacheHits = 0;
  private cacheMisses = 0;
  private cacheEvictions = 0;
  private disposed = false;
  private activePreloads = 0;
  private readonly preloadQueue: PreloadRequest[] = [];
  private readonly preloading = new Set<string>();

  constructor(
    private readonly request: typeof fetch = fetch,
    private readonly timeoutMs = 5_000,
    options: AssetLoaderOptions = {},
  ) {
    this.resourcePolicy = options.resourcePolicy ?? avatarRuntimeResourcePolicy;
    this.configuredCapacity = options.capacity === undefined
      ? undefined
      : Math.max(1, Math.floor(options.capacity));
  }

  load(asset: SignAsset): Promise<LoadedAsset> {
    if (this.disposed) return Promise.reject(new Error('Asset Loader has been disposed.'));
    if (hasAvatarClipSource(asset.metadata.avatar_clip)) {
      return Promise.resolve(avatarAssetManager.rendererInput(asset));
    }
    const key = assetCacheKey(asset);
    const cached = this.cache.get(key);
    if (cached) {
      this.cacheHits += 1;
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached.promise;
    }
    this.cacheMisses += 1;
    const started = now();
    const entry = { pending: true } as AssetCacheEntry;
    entry.promise = this.fetchAsset(asset)
      .catch((error) => {
        this.cache.delete(key);
        throw error;
      })
      .finally(() => {
        entry.pending = false;
        this.recordLoadTime(now() - started);
        this.evict();
      });
    this.cache.set(key, entry);
    this.evict();
    return entry.promise;
  }

  preload(
    asset: SignAsset | undefined,
    priority: AssetPreloadPriority = 'next',
  ): void {
    if (!asset || this.disposed) return;
    const key = assetCacheKey(asset);
    if (this.preloading.has(key)) return;
    this.preloading.add(key);
    this.preloadQueue.push({ asset, priority: PRELOAD_PRIORITY[priority] });
    this.preloadQueue.sort((left, right) => right.priority - left.priority);
    this.drainPreloads();
  }

  async warmUp(): Promise<void> {
    if (this.disposed) return;
    await avatarAssetManager.preloadFrequentlyUsed();
  }

  cleanup(): void {
    this.evict(true);
  }

  diagnostics(): AssetLoaderDiagnostics {
    const requests = this.cacheHits + this.cacheMisses;
    return Object.freeze({
      cacheEntries: this.cache.size,
      cacheCapacity: this.cacheCapacity,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      cacheEvictions: this.cacheEvictions,
      cacheHitRatio: requests === 0 ? 0 : this.cacheHits / requests,
      averageLoadTimeMs: this.loadTimes.length === 0
        ? 0
        : this.loadTimes.reduce((sum, value) => sum + value, 0) / this.loadTimes.length,
      activeLoads: this.controllers.size,
      activePreloads: this.activePreloads,
      queuedPreloads: this.preloadQueue.length,
      disposed: this.disposed,
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
    this.cache.clear();
    this.loadTimes.length = 0;
    this.activePreloads = 0;
    this.preloadQueue.length = 0;
    this.preloading.clear();
  }

  private async fetchAsset(asset: SignAsset): Promise<LoadedAsset> {
    const controller = new AbortController();
    this.controllers.add(controller);
    const timeout = globalThis.setTimeout(() => controller.abort(), this.timeoutMs);
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
          : asset.format === 'mp4'
            ? await response.blob()
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
      globalThis.clearTimeout(timeout);
      this.controllers.delete(controller);
    }
  }

  private get cacheCapacity(): number {
    return this.configuredCapacity ??
      this.resourcePolicy.current.genericAssetCacheCapacity;
  }

  private evict(removeAllReleased = false): void {
    const target = removeAllReleased ? 0 : this.cacheCapacity;
    if (this.cache.size <= target) return;
    for (const [key, entry] of this.cache) {
      if (this.cache.size <= target) break;
      if (entry.pending) continue;
      this.cache.delete(key);
      this.cacheEvictions += 1;
    }
  }

  private recordLoadTime(durationMs: number): void {
    this.loadTimes.push(Math.max(0, durationMs));
    if (this.loadTimes.length > 100) this.loadTimes.shift();
  }

  private drainPreloads(): void {
    const concurrency = this.resourcePolicy.current.preloadConcurrency;
    while (
      !this.disposed &&
      this.activePreloads < concurrency &&
      this.preloadQueue.length > 0
    ) {
      const request = this.preloadQueue.shift()!;
      this.activePreloads += 1;
      void this.preloadAsset(request.asset)
        .catch(() => undefined)
        .finally(() => {
          this.activePreloads = Math.max(0, this.activePreloads - 1);
          this.preloading.delete(assetCacheKey(request.asset));
          this.drainPreloads();
        });
    }
  }

  private async preloadAsset(asset: SignAsset): Promise<void> {
    if (!hasAvatarClipSource(asset.metadata.avatar_clip)) {
      await this.load(asset);
      return;
    }
    const lease = await avatarAssetManager.acquireAnimation({
      source: asset.metadata.avatar_clip,
      id: typeof asset.metadata.avatar_clip_id === 'string'
        ? asset.metadata.avatar_clip_id
        : undefined,
      integrity: typeof asset.metadata.avatar_clip_integrity === 'string'
        ? asset.metadata.avatar_clip_integrity
        : undefined,
    });
    lease.release();
  }
}

export const signAssetLoader = new AssetLoader();

const PRELOAD_PRIORITY: Readonly<Record<AssetPreloadPriority, number>> = Object.freeze({
  background: 0,
  frequent: 1,
  next: 2,
});

function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function assetCacheKey(asset: SignAsset): string {
  return `${asset.asset_id}\u0000${asset.version}\u0000${asset.source}`;
}
