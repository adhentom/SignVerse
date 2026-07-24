import { describe, expect, it, vi } from 'vitest';
import type { AvatarAssetManager } from '../../playback/avatar/assets';
import {
  AvatarRuntimeCoordinator,
  RuntimeResourcePolicy,
} from '../../playback/avatar/runtime';
import type {
  AvatarAssetDiagnostics,
} from '../../playback/avatar/assets/types';
import type { RenderingDiagnostics } from '../../playback/types';

function assetDiagnostics(
  changes: Partial<AvatarAssetDiagnostics> = {},
): AvatarAssetDiagnostics {
  return {
    avatarVersion: '1.0.0',
    status: 'ready',
    loadedAssets: 2,
    activeAssets: 1,
    cacheEntries: 2,
    cacheCapacity: 128,
    cacheHits: 3,
    cacheMisses: 1,
    cacheEvictions: 0,
    averageLoadTimeMs: 12,
    validationFailureCount: 0,
    missingResourceCount: 0,
    ...changes,
  };
}

function manager(
  diagnostics = assetDiagnostics(),
): AvatarAssetManager {
  return {
    preloadFrequentlyUsed: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn(),
    diagnostics: vi.fn(() => diagnostics),
  } as unknown as AvatarAssetManager;
}

function renderingDiagnostics(): RenderingDiagnostics {
  return {
    fps: 60,
    frameTimeMs: 16.67,
    animationQueueDepth: 1,
    blendDurationMs: 180,
    activeAnimation: 'HELLO',
    droppedRenderFrames: 0,
    health: {
      averageFps: 60,
      frameTimeDistributionMs: {
        p50: 16,
        p95: 18,
        p99: 20,
        maximum: 22,
      },
      droppedFramePercentage: 0,
      memoryUsageEstimateBytes: 0,
      memoryEstimateSource: 'unavailable',
      cacheHitRatio: 0,
      assetLoadLatencyMs: 0,
      renderLoopUptimeMs: 5_000,
      intentionallySkippedFrames: 0,
      recoveryAttempts: 0,
      fatalErrorCount: 0,
      resourceMode: 'standard',
      browserFamily: 'chrome',
      frameScheduler: 'animation-frame',
    },
  };
}

describe('AvatarRuntimeCoordinator', () => {
  it('deduplicates warm-up across coordinator instances for one asset manager', async () => {
    const assets = manager();
    const firstCoordinator = new AvatarRuntimeCoordinator(assets);
    const secondCoordinator = new AvatarRuntimeCoordinator(assets);

    const first = firstCoordinator.warmUp();
    const second = secondCoordinator.warmUp();
    await Promise.all([first, second]);

    expect(first).toBe(second);
    expect(assets.preloadFrequentlyUsed).toHaveBeenCalledOnce();
  });

  it('retains reusable assets in standard mode', () => {
    const assets = manager();
    const policy = new RuntimeResourcePolicy();
    policy.setMode('standard');
    const coordinator = new AvatarRuntimeCoordinator(assets, policy);

    coordinator.afterRendererRelease();

    expect(assets.cleanup).not.toHaveBeenCalled();
  });

  it('cleans released assets immediately in reduced-resource mode', () => {
    const assets = manager();
    const policy = new RuntimeResourcePolicy();
    policy.setMode('reduced');
    const coordinator = new AvatarRuntimeCoordinator(assets, policy);

    coordinator.afterRendererRelease();
    coordinator.afterRendererRelease();

    expect(assets.cleanup).toHaveBeenCalledTimes(2);
  });

  it('combines cache, load-time, and bounded memory estimates with renderer health', () => {
    const assets = manager(assetDiagnostics({
      activeAssets: 2,
      cacheEntries: 4,
      cacheHits: 7,
      cacheMisses: 3,
      averageLoadTimeMs: 24,
    }));
    const coordinator = new AvatarRuntimeCoordinator(assets);

    const decorated = coordinator.decorateDiagnostics(renderingDiagnostics());

    expect(decorated.health).toMatchObject({
      cacheHitRatio: 0.7,
      assetLoadLatencyMs: 24,
      memoryUsageEstimateBytes: 4 * 64 * 1_024 + 2 * 32 * 1_024,
      memoryEstimateSource: 'asset-cache-estimate',
    });
  });

  it('leaves renderer diagnostics untouched when health monitoring is absent', () => {
    const assets = manager();
    const coordinator = new AvatarRuntimeCoordinator(assets);
    const diagnostics = {
      ...renderingDiagnostics(),
      health: undefined,
    };

    expect(coordinator.decorateDiagnostics(diagnostics)).toBe(diagnostics);
    expect(assets.diagnostics).toHaveBeenCalledOnce();
  });
});
