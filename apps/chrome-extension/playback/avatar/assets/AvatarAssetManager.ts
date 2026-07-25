import animationLibrary from './animations.json';
import avatarManifest from './avatar.manifest.json';
import expressionLibrary from './expressions.json';
import handshapeLibrary from './handshapes.json';
import transitionLibrary from './transitions.json';
import { lookupAvatarClip, parseAvatarClip } from '../avatarClips';
import { AVATAR_PROFILES, DEFAULT_AVATAR, type AvatarProfile } from '../../avatarProfiles';
import type { LoadedAsset, SignAsset } from '../../types';
import { SvgAvatarAssetProvider } from './SvgAvatarAssetProvider';
import type {
  AnimationAssetDefinition,
  AvatarAnimationLease,
  AvatarAnimationRequest,
  AvatarAssetBundle,
  AvatarAssetDiagnostics,
  AvatarAssetManagerOptions,
  AvatarAssetProvider,
  AvatarRendererManifestEntry,
  AvatarVisualLease,
  ExpressionAssetDefinition,
  HandshapeAssetDefinition,
  TransitionAssetDefinition,
} from './types';
import { validateAvatarAssetBundle } from './validateAvatarAssets';
import { runtimeDiagnostic } from '../../../shared/runtimeDiagnostics';

interface ClipCacheEntry {
  promise: Promise<ReturnType<typeof parseAvatarClip>>;
  activeReferences: number;
  lastAccess: number;
  pending: boolean;
}

const BUILT_IN_BUNDLE = {
  manifest: avatarManifest,
  animations: animationLibrary,
  handshapes: handshapeLibrary,
  expressions: expressionLibrary,
  transitions: transitionLibrary,
};
const AVATAR_MANAGED_PAYLOAD = Object.freeze({ managedBy: 'avatar-asset-manager' });

function assetUrl(source: string): string {
  if (/^https?:\/\//u.test(source)) return source;
  return typeof chrome === 'undefined' ? source : chrome.runtime.getURL(source);
}

function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function normalizeId(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/gu, '_');
}

function arrayBufferToHex(value: ArrayBuffer): string {
  return [...new Uint8Array(value)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function arrayBufferToBase64(value: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(value)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function verifyIntegrity(payload: string, expected: string | undefined): Promise<void> {
  if (!expected) return;
  if (!globalThis.crypto?.subtle) {
    throw new Error('Animation integrity verification is unavailable.');
  }
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(payload),
  );
  const actual = expected.startsWith('sha256-')
    ? `sha256-${arrayBufferToBase64(digest)}`
    : arrayBufferToHex(digest);
  const matches = expected.startsWith('sha256-')
    ? actual === expected
    : actual.toLowerCase() === expected.toLowerCase();
  if (!matches) throw new Error('Animation asset integrity verification failed.');
}

export class AvatarAssetManager {
  private readonly request: typeof fetch;
  private readonly cacheCapacity: number;
  private readonly providers: AvatarAssetProvider[] = [];
  private readonly cache = new Map<string, ClipCacheEntry>();
  private readonly animations = new Map<string, AnimationAssetDefinition>();
  private readonly handshapes = new Map<string, HandshapeAssetDefinition>();
  private readonly expressions = new Map<string, ExpressionAssetDefinition>();
  private readonly transitions = new Map<string, TransitionAssetDefinition>();
  private readonly validationFailures: string[] = [];
  private readonly missingResources = new Set<string>();
  private readonly loadTimes: number[] = [];
  private bundle: AvatarAssetBundle;
  private cacheHits = 0;
  private cacheMisses = 0;
  private cacheEvictions = 0;
  private activeAssets = 0;
  private disposed = false;
  private generation = 0;

  constructor(options: AvatarAssetManagerOptions = {}) {
    this.request = options.request ?? fetch;
    this.cacheCapacity = Math.max(1, Math.floor(options.cacheCapacity ?? 128));
    const validationOptions = {
      supportedManifestMajor: options.supportedManifestMajor ?? 1,
      supportedAnimationMajor: options.supportedAnimationMajor ?? 1,
    };
    const requested = validateAvatarAssetBundle(options.bundle ?? BUILT_IN_BUNDLE, validationOptions);
    const builtIn = validateAvatarAssetBundle(BUILT_IN_BUNDLE, validationOptions);
    if (!builtIn.bundle) {
      throw new Error(`Built-in avatar assets are invalid: ${builtIn.failures.join(' ')}`);
    }
    this.bundle = requested.bundle ?? builtIn.bundle;
    this.validationFailures.push(...requested.failures);
    for (const provider of options.providers ?? [new SvgAvatarAssetProvider()]) {
      this.providers.push(provider);
    }
    this.indexLibraries();
    runtimeDiagnostic('avatar_asset_manager_initialized', {
      avatarVersion: this.bundle.manifest.avatarVersion,
      rigVersion: this.bundle.manifest.rigVersion,
      animationVersion: this.bundle.manifest.animationVersion,
      animations: this.bundle.animations.length,
      handshapes: this.bundle.handshapes.length,
      expressions: this.bundle.expressions.length,
      transitions: this.bundle.transitions.length,
      validationFailures: this.validationFailures.length,
    });
    if (this.bundle.animations.length === 0) {
      runtimeDiagnostic('avatar_animation_library_empty', {
        diagnosis:
          'No predeclared animation assets are bundled; validated playback assets load on demand.',
      });
    }
    this.preloadAnimationLibrary();
  }

  get manifest(): Readonly<AvatarAssetBundle['manifest']> {
    return this.bundle.manifest;
  }

  discoverProfiles(): readonly AvatarProfile[] {
    const supported = new Set(this.bundle.manifest.renderers.flatMap((entry) => entry.profiles));
    return AVATAR_PROFILES.filter((profile) => supported.has(profile.id));
  }

  acquireVisual(profile: AvatarProfile = DEFAULT_AVATAR): AvatarVisualLease {
    this.assertActive();
    const renderer = this.selectRenderer(profile) ?? this.selectFallbackRenderer();
    const selectedProfile = renderer.profiles.includes(profile.id)
      ? profile
      : this.defaultManifestProfile(renderer);
    const provider = this.providers.find(
      (candidate) => candidate.kind === renderer.kind &&
        candidate.supports(selectedProfile, renderer),
    );
    if (!provider?.supports(selectedProfile, renderer)) {
      this.validationFailures.push(
        `No ${renderer.kind} provider supports renderer "${renderer.id}" and profile "${selectedProfile.id}".`,
      );
      throw new Error('Avatar visual asset is unavailable.');
    }
    const lease = provider.acquire(selectedProfile, renderer);
    this.activeAssets += 1;
    let released = false;
    return {
      asset: lease.asset,
      release: () => {
        if (released) return;
        released = true;
        this.activeAssets = Math.max(0, this.activeAssets - 1);
        lease.release();
      },
    };
  }

  async acquireAnimation(request: AvatarAnimationRequest): Promise<AvatarAnimationLease> {
    this.assertActive();
    if (typeof request.source !== 'string' || request.source.trim().length === 0) {
      this.validationFailures.push('Animation request has no source.');
      throw new Error('No validated avatar clip is registered.');
    }
    const source = request.source.trim();
    const metadata = this.animationMetadata(request.id ?? source);
    const integrity = request.integrity ?? metadata?.integrity;
    runtimeDiagnostic('avatar_animation_asset_requested', {
      animationId: request.id ?? null,
      source,
      metadataResolved: Boolean(metadata),
    });
    try {
      const lease = await this.acquireClip(source, integrity, metadata);
      runtimeDiagnostic('avatar_animation_asset_loaded', {
        animationId: lease.clip.id,
        source,
        cacheEntries: this.cache.size,
      });
      return lease;
    } catch (error) {
      const fallback = request.fallbackSource ??
        (metadata?.fallbackAnimationId
          ? this.animations.get(metadata.fallbackAnimationId)?.source
          : undefined);
      if (fallback && fallback !== source) {
        runtimeDiagnostic('avatar_animation_asset_fallback', {
          source,
          fallback,
          message: error instanceof Error ? error.message : String(error),
        }, 'warn');
        const fallbackMetadata = this.animationMetadata(fallback);
        return this.acquireClip(fallback, fallbackMetadata?.integrity, fallbackMetadata);
      }
      runtimeDiagnostic('avatar_animation_asset_load_failed', {
        animationId: request.id ?? null,
        source,
        message: error instanceof Error ? error.message : String(error),
      }, 'error');
      throw error;
    }
  }

  animationMetadata(idOrSource: string): AnimationAssetDefinition | undefined {
    return this.animations.get(idOrSource) ??
      [...this.animations.values()].find((entry) => entry.source === idOrSource);
  }

  resolveHandshape(value: string): HandshapeAssetDefinition | undefined {
    return this.handshapes.get(normalizeId(value));
  }

  expression(id: string): ExpressionAssetDefinition | undefined {
    return this.expressions.get(normalizeId(id));
  }

  transition(id: string): TransitionAssetDefinition | undefined {
    return this.transitions.get(normalizeId(id));
  }

  rendererInput(asset: SignAsset): LoadedAsset {
    this.assertActive();
    return { metadata: asset, data: AVATAR_MANAGED_PAYLOAD };
  }

  preloadAnimation(request: AvatarAnimationRequest): void {
    void this.acquireAnimation(request)
      .then((lease) => lease.release())
      .catch(() => undefined);
  }

  async preloadFrequentlyUsed(): Promise<void> {
    await Promise.all(this.bundle.manifest.frequentlyUsedAnimations.map(async (id) => {
      const metadata = this.animations.get(id);
      if (!metadata) return;
      try {
        const lease = await this.acquireAnimation({
          source: metadata.source,
          id: metadata.id,
          integrity: metadata.integrity,
        });
        lease.release();
      } catch {
        // Diagnostics already record the unavailable resource.
      }
    }));
  }

  diagnostics(developerMode = false): AvatarAssetDiagnostics {
    const averageLoadTimeMs = this.loadTimes.length === 0
      ? 0
      : this.loadTimes.reduce((sum, value) => sum + value, 0) / this.loadTimes.length;
    return {
      avatarVersion: this.bundle.manifest.avatarVersion,
      status: this.validationFailures.length > 0 || this.missingResources.size > 0
        ? 'degraded'
        : 'ready',
      loadedAssets: this.cache.size,
      activeAssets: this.activeAssets,
      cacheEntries: this.cache.size,
      cacheCapacity: this.cacheCapacity,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      cacheEvictions: this.cacheEvictions,
      averageLoadTimeMs,
      validationFailureCount: this.validationFailures.length,
      missingResourceCount: this.missingResources.size,
      ...(developerMode ? {
        validationFailures: [...this.validationFailures],
        missingResources: [...this.missingResources],
      } : {}),
    };
  }

  cleanup(): void {
    for (const [key, entry] of this.cache) {
      if (!entry.pending && entry.activeReferences === 0) this.cache.delete(key);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    this.cache.clear();
    for (const provider of this.providers) provider.dispose();
    this.providers.length = 0;
    this.activeAssets = 0;
  }

  private indexLibraries(): void {
    for (const entry of this.bundle.animations) this.animations.set(entry.id, entry);
    for (const entry of this.bundle.handshapes) {
      this.handshapes.set(normalizeId(entry.id), entry);
      for (const alias of entry.aliases) this.handshapes.set(normalizeId(alias), entry);
    }
    for (const entry of this.bundle.expressions) this.expressions.set(normalizeId(entry.id), entry);
    for (const entry of this.bundle.transitions) this.transitions.set(normalizeId(entry.id), entry);
  }

  private preloadAnimationLibrary(): void {
    if (this.bundle.manifest.frequentlyUsedAnimations.length === 0) return;
    void this.preloadFrequentlyUsed();
  }

  private selectRenderer(profile: AvatarProfile): AvatarRendererManifestEntry | undefined {
    const preferred = this.bundle.manifest.renderers.find(
      (entry) => entry.id === this.bundle.manifest.defaultRenderer,
    );
    if (preferred?.profiles.includes(profile.id)) return preferred;
    return this.bundle.manifest.renderers.find((entry) => entry.profiles.includes(profile.id));
  }

  private selectFallbackRenderer(): AvatarRendererManifestEntry {
    const fallback = this.bundle.manifest.renderers.find((entry) => entry.fallback);
    if (!fallback) throw new Error('Avatar fallback renderer is unavailable.');
    return fallback;
  }

  private defaultManifestProfile(renderer: AvatarRendererManifestEntry): AvatarProfile {
    const requested = AVATAR_PROFILES.find(
      (profile) => profile.id === this.bundle.manifest.defaultProfile &&
        renderer.profiles.includes(profile.id),
    );
    const firstSupported = AVATAR_PROFILES.find((profile) => renderer.profiles.includes(profile.id));
    return requested ?? firstSupported ?? DEFAULT_AVATAR;
  }

  private async acquireClip(
    source: string,
    integrity?: string,
    metadata?: AnimationAssetDefinition,
  ): Promise<AvatarAnimationLease> {
    const key = `${source}\u0000${integrity ?? ''}`;
    let entry = this.cache.get(key);
    if (entry) {
      this.cacheHits += 1;
      entry.lastAccess = now();
      this.cache.delete(key);
      this.cache.set(key, entry);
    } else {
      this.cacheMisses += 1;
      const generation = this.generation;
      entry = {
        promise: this.loadClip(source, integrity).then((clip) => {
          if (this.disposed || generation !== this.generation) {
            throw new Error('Avatar Asset Manager was disposed during loading.');
          }
          return clip;
        }).catch((error) => {
          this.cache.delete(key);
          throw error;
        }).finally(() => {
          if (entry) entry.pending = false;
        }),
        activeReferences: 0,
        lastAccess: now(),
        pending: true,
      };
      this.cache.set(key, entry);
      this.evict();
    }
    entry.activeReferences += 1;
    let clip: ReturnType<typeof parseAvatarClip>;
    try {
      clip = await entry.promise;
      if (metadata && (
        clip.id !== metadata.id ||
        Math.abs(clip.duration - metadata.duration) > 0.05
      )) {
        this.cache.delete(key);
        this.recordValidationFailure(
          `Animation "${metadata.id}" does not match its clip id or duration.`,
        );
        throw new Error('Animation clip does not match its library metadata.');
      }
      this.activeAssets += 1;
    } catch (error) {
      entry.activeReferences = Math.max(0, entry.activeReferences - 1);
      throw error;
    }
    let released = false;
    return {
      clip,
      metadata,
      release: () => {
        if (released) return;
        released = true;
        entry.activeReferences = Math.max(0, entry.activeReferences - 1);
        this.activeAssets = Math.max(0, this.activeAssets - 1);
        this.evict();
      },
    };
  }

  private async loadClip(source: string, integrity: string | undefined) {
    const started = now();
    try {
      const registered = lookupAvatarClip(source);
      if (registered) {
        this.missingResources.delete(source);
        return parseAvatarClip(registered);
      }
      const response = await this.request(assetUrl(source));
      if (!response.ok) {
        this.missingResources.add(source);
        throw new Error('Animation clip could not be loaded.');
      }
      const payload = await response.text();
      try {
        await verifyIntegrity(payload, integrity);
      } catch (error) {
        this.recordValidationFailure(
          `Animation "${source}" failed integrity verification.`,
        );
        throw error;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(payload);
      } catch {
        this.recordValidationFailure(`Animation "${source}" is corrupted.`);
        throw new Error('Animation clip is corrupted.');
      }
      try {
        const parsedClip = parseAvatarClip(parsed);
        this.missingResources.delete(source);
        return parsedClip;
      } catch (error) {
        this.recordValidationFailure(`Animation "${source}" has invalid clip metadata.`);
        throw error;
      }
    } finally {
      this.loadTimes.push(now() - started);
      if (this.loadTimes.length > 100) this.loadTimes.shift();
    }
  }

  private evict(): void {
    if (this.cache.size <= this.cacheCapacity) return;
    for (const [key, entry] of this.cache) {
      if (this.cache.size <= this.cacheCapacity) break;
      if (entry.pending || entry.activeReferences > 0) continue;
      this.cache.delete(key);
      this.cacheEvictions += 1;
    }
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('Avatar Asset Manager has been disposed.');
  }

  private recordValidationFailure(message: string): void {
    if (!this.validationFailures.includes(message)) this.validationFailures.push(message);
  }
}

export const avatarAssetManager = new AvatarAssetManager();

const REQUEST_MANAGERS = new WeakMap<typeof fetch, AvatarAssetManager>();

export function avatarAssetManagerFor(request: typeof fetch): AvatarAssetManager {
  if (request === fetch) return avatarAssetManager;
  const existing = REQUEST_MANAGERS.get(request);
  if (existing) return existing;
  const manager = new AvatarAssetManager({ request });
  REQUEST_MANAGERS.set(request, manager);
  return manager;
}
