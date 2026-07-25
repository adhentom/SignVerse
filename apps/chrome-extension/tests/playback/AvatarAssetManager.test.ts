import { afterEach, describe, expect, it, vi } from 'vitest';
import animationLibrary from '../../playback/avatar/assets/animations.json';
import avatarManifest from '../../playback/avatar/assets/avatar.manifest.json';
import expressionLibrary from '../../playback/avatar/assets/expressions.json';
import handshapeLibrary from '../../playback/avatar/assets/handshapes.json';
import transitionLibrary from '../../playback/avatar/assets/transitions.json';
import {
  AvatarAssetManager,
  validateAvatarAssetBundle,
  type AvatarAssetBundle,
  type AvatarAssetProvider,
} from '../../playback/avatar/assets';

const clip = {
  schema: 'signverse.animation-clip',
  schema_version: '1.0',
  id: 'asset-manager-test',
  duration: 1,
  rig: {
    name: 'signverse-hierarchical-svg',
    version: '2.0',
    coordinate_space: 'joint-local-degrees',
    solver: 'fixed-length-two-bone-ik',
  },
  keyframes: [
    { offset: 0, pose: { 'left-hand': { rotation: 0 } } },
    { offset: 1, pose: { 'left-hand': { rotation: 30 } } },
  ],
};

function builtInBundle(): AvatarAssetBundle {
  return structuredClone({
    manifest: avatarManifest,
    animations: animationLibrary,
    handshapes: handshapeLibrary,
    expressions: expressionLibrary,
    transitions: transitionLibrary,
  }) as AvatarAssetBundle;
}

function responseFor(source: string | URL | Request): Response {
  return new Response(JSON.stringify({ ...clip, id: String(source) }), { status: 200 });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AvatarAssetManager', () => {
  it('treats an empty predeclared animation library as an on-demand state', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const manager = new AvatarAssetManager();

    expect(warn).not.toHaveBeenCalled();
    manager.dispose();
  });

  it('discovers versioned avatar profiles and metadata libraries', () => {
    const manager = new AvatarAssetManager();

    expect(manager.manifest).toMatchObject({
      avatarVersion: '1.0.0',
      rigVersion: '6.0',
      animationVersion: '1.0',
    });
    expect(manager.discoverProfiles().map((profile) => profile.id))
      .toEqual(['adult-female', 'adult-male']);
    expect(manager.resolveHandshape('OPEN-HAND')).toMatchObject({
      id: 'open_palm',
      rendererShapeId: 'open',
    });
    expect(manager.expression('question')?.nonManualMarkers).toEqual(['question']);
    expect(manager.transition('directional')?.interpolationProfile).toBe('directional');
    expect(manager.diagnostics()).toMatchObject({
      status: 'ready',
      validationFailureCount: 0,
      missingResourceCount: 0,
    });
    manager.dispose();
  });

  it('lazy-loads clips, reuses cached data, and reference-counts active assets', async () => {
    const request = vi.fn<typeof fetch>(async (source) => responseFor(source));
    const manager = new AvatarAssetManager({ request, cacheCapacity: 2 });
    expect(manager.diagnostics()).toMatchObject({ cacheEntries: 0, cacheMisses: 0 });

    const first = await manager.acquireAnimation({ source: 'animations/hello.json' });
    expect(request).toHaveBeenCalledTimes(1);
    expect(manager.diagnostics()).toMatchObject({
      cacheEntries: 1,
      cacheMisses: 1,
      activeAssets: 1,
    });
    first.release();
    const second = await manager.acquireAnimation({ source: 'animations/hello.json' });

    expect(request).toHaveBeenCalledTimes(1);
    expect(manager.diagnostics()).toMatchObject({ cacheHits: 1, activeAssets: 1 });
    second.release();
    manager.dispose();
  });

  it('uses bounded least-recently-used caching and evicts only released assets', async () => {
    const manager = new AvatarAssetManager({
      request: vi.fn<typeof fetch>(async (source) => responseFor(source)),
      cacheCapacity: 1,
    });
    const active = await manager.acquireAnimation({ source: 'animations/active.json' });
    const next = await manager.acquireAnimation({ source: 'animations/next.json' });

    expect(manager.diagnostics()).toMatchObject({ cacheEntries: 2, activeAssets: 2 });
    next.release();
    expect(manager.diagnostics()).toMatchObject({ cacheEntries: 1, cacheEvictions: 1 });
    active.release();
    manager.cleanup();
    expect(manager.diagnostics()).toMatchObject({ cacheEntries: 0, activeAssets: 0 });
    manager.dispose();
  });

  it('deduplicates concurrent loads and never evicts an in-flight asset', async () => {
    let resolveResponse: ((response: Response) => void) | undefined;
    const request = vi.fn<typeof fetch>(() => new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    }));
    const manager = new AvatarAssetManager({ request, cacheCapacity: 1 });
    const first = manager.acquireAnimation({ source: 'animations/pending.json' });
    const second = manager.acquireAnimation({ source: 'animations/pending.json' });

    manager.cleanup();
    expect(manager.diagnostics()).toMatchObject({ cacheEntries: 1, cacheMisses: 1, cacheHits: 1 });
    expect(request).toHaveBeenCalledTimes(1);
    resolveResponse?.(responseFor('animations/pending.json'));
    const [firstLease, secondLease] = await Promise.all([first, second]);

    expect(firstLease.clip).toBe(secondLease.clip);
    expect(manager.diagnostics()).toMatchObject({ activeAssets: 2 });
    firstLease.release();
    secondLease.release();
    manager.dispose();
  });

  it('loads a declared fallback when the primary clip is missing', async () => {
    const request = vi.fn<typeof fetch>(async (source) => (
      String(source).includes('missing')
        ? new Response('', { status: 404 })
        : responseFor(source)
    ));
    const manager = new AvatarAssetManager({ request });

    const lease = await manager.acquireAnimation({
      source: 'animations/missing.json',
      fallbackSource: 'animations/fallback.json',
    });

    expect(lease.clip.id).toBe('animations/fallback.json');
    expect(request).toHaveBeenCalledTimes(2);
    expect(manager.diagnostics(true)).toMatchObject({
      status: 'degraded',
      missingResources: ['animations/missing.json'],
    });
    lease.release();
    manager.dispose();
  });

  it('preloads frequently used animation metadata from the versioned library', async () => {
    const bundle = builtInBundle();
    bundle.animations.push({
      id: 'FREQUENT',
      source: 'animations/frequent.json',
      duration: 1,
      defaultBlendProfile: 'default',
      transitionProfile: 'default',
      expressionProfile: 'neutral',
      requiredHandshape: 'open_palm',
      version: '1.0',
    });
    bundle.manifest.frequentlyUsedAnimations = ['FREQUENT'];
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      ...clip,
      id: 'FREQUENT',
    }), { status: 200 }));
    const manager = new AvatarAssetManager({ bundle, request });

    await manager.preloadFrequentlyUsed();

    expect(request).toHaveBeenCalledWith('animations/frequent.json');
    expect(manager.animationMetadata('FREQUENT')).toMatchObject({
      defaultBlendProfile: 'default',
      expressionProfile: 'neutral',
      requiredHandshape: 'open_palm',
    });
    expect(manager.diagnostics()).toMatchObject({ loadedAssets: 1, activeAssets: 0 });
    manager.dispose();
  });

  it('rejects a clip that disagrees with declared animation metadata', async () => {
    const bundle = builtInBundle();
    bundle.animations.push({
      id: 'DECLARED',
      source: 'animations/declared.json',
      duration: 2,
      defaultBlendProfile: 'default',
      transitionProfile: 'default',
      expressionProfile: 'neutral',
      requiredHandshape: 'open_palm',
      version: '1.0',
    });
    const manager = new AvatarAssetManager({
      bundle,
      request: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ ...clip, id: 'DIFFERENT', duration: 1 }), { status: 200 }),
      ),
    });

    await expect(manager.acquireAnimation({
      source: 'animations/declared.json',
      id: 'DECLARED',
    })).rejects.toThrow('does not match');
    expect(manager.diagnostics()).toMatchObject({
      cacheEntries: 0,
      validationFailureCount: 1,
    });
    manager.dispose();
  });

  it('rejects corrupted and integrity-mismatched clips without retaining them', async () => {
    const corrupted = new AvatarAssetManager({
      request: vi.fn<typeof fetch>().mockResolvedValue(
        new Response('{not-json', { status: 200 }),
      ),
    });
    await expect(corrupted.acquireAnimation({ source: 'animations/corrupt.json' }))
      .rejects.toThrow('corrupted');
    expect(corrupted.diagnostics()).toMatchObject({
      cacheEntries: 0,
      missingResourceCount: 0,
      validationFailureCount: 1,
    });
    corrupted.dispose();

    const integrity = new AvatarAssetManager({
      request: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify(clip), { status: 200 }),
      ),
    });
    await expect(integrity.acquireAnimation({
      source: 'animations/tampered.json',
      integrity: '0'.repeat(64),
    })).rejects.toThrow('integrity');
    expect(integrity.diagnostics()).toMatchObject({ cacheEntries: 0 });
    integrity.dispose();
  });

  it('acquires and releases branded visuals exclusively through a provider', () => {
    const manager = new AvatarAssetManager();
    const lease = manager.acquireVisual();

    expect(lease.asset).toMatchObject({
      kind: 'svg',
      profile: 'adult-female',
      rendererId: 'signverse-svg-v2',
    });
    expect(lease.asset.resource).toBeInstanceOf(SVGSVGElement);
    expect(manager.diagnostics()).toMatchObject({ activeAssets: 1 });
    lease.release();
    expect(manager.diagnostics()).toMatchObject({ activeAssets: 0 });
    manager.dispose();
  });

  it('supports multiple implementations of the same renderer kind', () => {
    const acquireFemale = vi.fn();
    const acquireMale = vi.fn();
    const provider = (
      profileId: 'adult-female' | 'adult-male',
      acquire: (id: string) => void,
    ): AvatarAssetProvider => ({
      kind: 'svg',
      supports: (profile) => profile.id === profileId,
      acquire: (profile, renderer) => {
        acquire(profile.id);
        return {
          asset: {
            kind: 'svg',
            profile: profile.id,
            rendererId: renderer.id,
            resource: document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
          },
          release: vi.fn(),
        };
      },
      dispose: vi.fn(),
    });
    const manager = new AvatarAssetManager({
      providers: [
        provider('adult-female', acquireFemale),
        provider('adult-male', acquireMale),
      ],
    });

    const female = manager.acquireVisual(manager.discoverProfiles()[0]);
    const male = manager.acquireVisual(manager.discoverProfiles()[1]);

    expect(acquireFemale).toHaveBeenCalledWith('adult-female');
    expect(acquireMale).toHaveBeenCalledWith('adult-male');
    female.release();
    male.release();
    manager.dispose();
  });

  it('redacts validation details outside developer diagnostics', () => {
    const invalid = builtInBundle();
    invalid.manifest.avatarVersion = '99.0.0';
    const manager = new AvatarAssetManager({ bundle: invalid });

    expect(manager.manifest.avatarVersion).toBe('1.0.0');
    const productionDiagnostics = manager.diagnostics();
    expect(productionDiagnostics).toMatchObject({
      status: 'degraded',
      validationFailureCount: 1,
    });
    expect(productionDiagnostics).not.toHaveProperty('validationFailures');
    expect(manager.diagnostics(true).validationFailures?.[0]).toContain('unsupported');
    manager.dispose();
  });

  it('prevents use after lifecycle disposal', async () => {
    const manager = new AvatarAssetManager();
    manager.dispose();

    expect(() => manager.acquireVisual()).toThrow('disposed');
    await expect(manager.acquireAnimation({ source: 'animations/hello.json' }))
      .rejects.toThrow('disposed');
  });

  it('discards a late result when disposed during loading', async () => {
    let resolveResponse: ((response: Response) => void) | undefined;
    const manager = new AvatarAssetManager({
      request: vi.fn<typeof fetch>(() => new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      })),
    });
    const loading = manager.acquireAnimation({ source: 'animations/late.json' });
    manager.dispose();
    resolveResponse?.(responseFor('animations/late.json'));

    await expect(loading).rejects.toThrow('disposed during loading');
    expect(manager.diagnostics()).toMatchObject({ cacheEntries: 0, activeAssets: 0 });
  });

  it('clears transient missing-resource diagnostics after a successful retry', async () => {
    let attempt = 0;
    const manager = new AvatarAssetManager({
      request: vi.fn<typeof fetch>(async (source) => {
        attempt += 1;
        return attempt === 1 ? new Response('', { status: 404 }) : responseFor(source);
      }),
    });
    await expect(manager.acquireAnimation({ source: 'animations/retry.json' })).rejects.toThrow();
    expect(manager.diagnostics()).toMatchObject({ missingResourceCount: 1 });

    const recovered = await manager.acquireAnimation({ source: 'animations/retry.json' });
    expect(manager.diagnostics()).toMatchObject({ missingResourceCount: 0 });
    recovered.release();
    manager.dispose();
  });
});

describe('avatar asset validation', () => {
  const supported = { supportedManifestMajor: 1, supportedAnimationMajor: 1 };

  it('detects duplicate IDs, invalid references, and missing required metadata', () => {
    const bundle = builtInBundle();
    bundle.handshapes.push({ ...bundle.handshapes[0] });
    bundle.animations.push({
      id: 'HELLO',
      source: 'hello.json',
      duration: 1,
      defaultBlendProfile: 'default',
      transitionProfile: 'missing',
      expressionProfile: 'missing',
      requiredHandshape: 'missing',
      version: '1.0',
      fallbackAnimationId: 'missing',
    });

    const result = validateAvatarAssetBundle(bundle, supported);

    expect(result.bundle).toBeUndefined();
    expect(result.failures.join(' ')).toContain('duplicate id');
    expect(result.failures.join(' ')).toContain('missing transition');
    expect(result.failures.join(' ')).toContain('missing expression');
    expect(result.failures.join(' ')).toContain('missing handshape');
    expect(result.failures.join(' ')).toContain('missing fallback');
  });

  it('detects circular animation fallbacks and incompatible versions', () => {
    const bundle = builtInBundle();
    bundle.animations.push(
      {
        id: 'A', source: 'a.json', duration: 1, defaultBlendProfile: 'default',
        transitionProfile: 'default', expressionProfile: 'neutral',
        requiredHandshape: 'open_palm', version: '1.0', fallbackAnimationId: 'B',
      },
      {
        id: 'B', source: 'b.json', duration: 1, defaultBlendProfile: 'default',
        transitionProfile: 'default', expressionProfile: 'neutral',
        requiredHandshape: 'open_palm', version: '1.0', fallbackAnimationId: 'A',
      },
    );
    bundle.manifest.animationVersion = '2.0';

    const result = validateAvatarAssetBundle(bundle, supported);

    expect(result.failures.join(' ')).toContain('unsupported');
    expect(result.failures.join(' ')).toContain('circular reference');
  });

  it('rejects incompatible rigs, profiles, renderer handshapes, and easing', () => {
    const bundle = builtInBundle();
    bundle.manifest.rigVersion = '99.0';
    bundle.manifest.renderers[0].rigId = 'incompatible-rig';
    bundle.manifest.renderers[0].profiles = ['adult-male'];
    bundle.handshapes[0].rendererShapeId = 'unknown-renderer-shape';
    bundle.transitions[0].easing = 'execute-arbitrary-code()';

    const result = validateAvatarAssetBundle(bundle, supported);
    const failures = result.failures.join(' ');

    expect(failures).toContain('rig version');
    expect(failures).toContain('profile rig');
    expect(failures).toContain('defaultRenderer does not support defaultProfile');
    expect(failures).toContain('unsupported renderer shape');
    expect(failures).toContain('invalid metadata');
  });
});
