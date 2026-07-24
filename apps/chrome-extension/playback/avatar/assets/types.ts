import type { AvatarClip } from '../AvatarAnimationEngine';
import type { AvatarProfile, AvatarProfileId } from '../../avatarProfiles';

export type AvatarRendererKind = 'svg' | 'glb' | 'vrm';

export interface AvatarManifest {
  schemaVersion: '1.0';
  avatarVersion: string;
  rigVersion: string;
  animationVersion: string;
  defaultProfile: AvatarProfileId;
  defaultRenderer: string;
  supportedFeatures: {
    handShapes: boolean;
    facialExpressions: boolean;
    eyeTracking: boolean;
    secondaryMotion: boolean;
  };
  renderers: AvatarRendererManifestEntry[];
  libraries: {
    animations: string;
    handshapes: string;
    expressions: string;
    transitions: string;
  };
  frequentlyUsedAnimations: string[];
}

export interface AvatarRendererManifestEntry {
  id: string;
  kind: AvatarRendererKind;
  version: string;
  rigId: string;
  profiles: AvatarProfileId[];
  fallback: boolean;
}

export interface AnimationAssetDefinition {
  id: string;
  source: string;
  duration: number;
  defaultBlendProfile: string;
  transitionProfile: string;
  expressionProfile: string;
  requiredHandshape: string;
  version: string;
  integrity?: string;
  fallbackAnimationId?: string;
}

export interface HandshapeAssetDefinition {
  id: string;
  rendererShapeId: string;
  aliases: string[];
  version: string;
}

export interface ExpressionAssetDefinition {
  id: string;
  nonManualMarkers: string[];
  version: string;
}

export interface TransitionAssetDefinition {
  id: string;
  easing: string;
  duration: number;
  interpolationProfile: 'linear' | 'ease' | 'directional' | 'emphasis';
  version: string;
}

export interface AvatarAssetBundle {
  manifest: AvatarManifest;
  animations: AnimationAssetDefinition[];
  handshapes: HandshapeAssetDefinition[];
  expressions: ExpressionAssetDefinition[];
  transitions: TransitionAssetDefinition[];
}

export interface AvatarVisualAsset {
  kind: AvatarRendererKind;
  profile: AvatarProfileId;
  rendererId: string;
  resource: unknown;
}

export interface AvatarVisualLease {
  asset: AvatarVisualAsset;
  release(): void;
}

export interface AvatarAnimationLease {
  clip: AvatarClip;
  metadata?: AnimationAssetDefinition;
  release(): void;
}

export interface AvatarAnimationRequest {
  source: unknown;
  id?: string;
  integrity?: string;
  fallbackSource?: string;
}

export interface AvatarAssetProvider {
  readonly kind: AvatarRendererKind;
  supports(profile: AvatarProfile, renderer: AvatarRendererManifestEntry): boolean;
  acquire(profile: AvatarProfile, renderer: AvatarRendererManifestEntry): AvatarVisualLease;
  dispose(): void;
}

export interface AvatarAssetDiagnostics {
  avatarVersion: string;
  status: 'ready' | 'degraded';
  loadedAssets: number;
  activeAssets: number;
  cacheEntries: number;
  cacheCapacity: number;
  cacheHits: number;
  cacheMisses: number;
  cacheEvictions: number;
  averageLoadTimeMs: number;
  validationFailureCount: number;
  missingResourceCount: number;
  validationFailures?: string[];
  missingResources?: string[];
}

export interface AvatarAssetManagerOptions {
  request?: typeof fetch;
  bundle?: unknown;
  providers?: AvatarAssetProvider[];
  cacheCapacity?: number;
  supportedManifestMajor?: number;
  supportedAnimationMajor?: number;
}
