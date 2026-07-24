import type { AvatarAssetManager } from '../assets';
import type { RenderingDiagnostics } from '../../types';
import {
  avatarRuntimeResourcePolicy,
  type RuntimeResourcePolicy,
} from './RuntimeResourcePolicy';
import { runtimeDiagnostic } from '../../../shared/runtimeDiagnostics';

const WARMUPS = new WeakMap<AvatarAssetManager, Promise<void>>();
const ESTIMATED_CACHE_ENTRY_BYTES = 64 * 1_024;
const ESTIMATED_ACTIVE_ASSET_BYTES = 32 * 1_024;

/**
 * Owns renderer-local asset lifecycle policy without changing Asset Manager
 * semantics or exposing its implementation to playback.
 */
export class AvatarRuntimeCoordinator {
  constructor(
    private readonly assets: AvatarAssetManager,
    private readonly resourcePolicy: RuntimeResourcePolicy = avatarRuntimeResourcePolicy,
  ) {}

  warmUp(): Promise<void> {
    const existing = WARMUPS.get(this.assets);
    if (existing) return existing;
    const avatarVersion = this.assets.diagnostics(false).avatarVersion;
    runtimeDiagnostic('avatar_runtime_warmup_started', {
      avatarVersion,
    });
    const warmup = this.assets.preloadFrequentlyUsed()
      .then(() => {
        runtimeDiagnostic('avatar_runtime_warmup_completed', {
          avatarVersion,
          loadedAssets: this.assets.diagnostics(false).loadedAssets,
        });
      })
      .catch((error: unknown) => {
        runtimeDiagnostic('avatar_runtime_warmup_failed', {
          avatarVersion,
          message: error instanceof Error ? error.message : String(error),
        }, 'warn');
      });
    WARMUPS.set(this.assets, warmup);
    return warmup;
  }

  afterRendererRelease(): void {
    if (this.resourcePolicy.mode === 'reduced') this.assets.cleanup();
  }

  decorateDiagnostics(rendering: RenderingDiagnostics): RenderingDiagnostics {
    const asset = this.assets.diagnostics(false);
    const requests = asset.cacheHits + asset.cacheMisses;
    const health = rendering.health;
    if (!health) return rendering;
    const memoryUnavailable = health.memoryEstimateSource === 'unavailable';
    return {
      ...rendering,
      health: {
        ...health,
        cacheHitRatio: requests === 0 ? 0 : asset.cacheHits / requests,
        assetLoadLatencyMs: asset.averageLoadTimeMs,
        memoryUsageEstimateBytes: memoryUnavailable
          ? asset.cacheEntries * ESTIMATED_CACHE_ENTRY_BYTES +
            asset.activeAssets * ESTIMATED_ACTIVE_ASSET_BYTES
          : health.memoryUsageEstimateBytes,
        memoryEstimateSource: memoryUnavailable
          ? 'asset-cache-estimate'
          : health.memoryEstimateSource,
      },
    };
  }
}
