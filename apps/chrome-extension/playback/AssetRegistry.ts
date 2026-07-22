import type { SignAsset } from './types';
import type { AnimationRegistry } from './contracts';
import datasetAssets from './datasetAssets.json';
import animationAssets from './animationAssets.json';
import { nativeReviewFor } from './nativeReview';

// Public releases intentionally ship no third-party sign media. Authorized,
// reviewed imports populate these generated manifests in local deployments.
const CLIPS = animationAssets as Record<string, { path: string; clip_id: string }>;
const ASSETS: SignAsset[] = (datasetAssets as SignAsset[]).map((entry) => {
  const clip = CLIPS[entry.asset_id];
  const native_review = nativeReviewFor(entry.asset_id);
  return clip
    ? { ...entry, native_review, metadata: { ...entry.metadata, avatar_clip: clip.path, avatar_clip_id: clip.clip_id } }
    : { ...entry, native_review };
});

export class AssetRegistry implements AnimationRegistry {
  private readonly byId = new Map(ASSETS.map((asset) => [asset.asset_id, asset]));
  private readonly byGloss = new Map(ASSETS.flatMap((asset) => (
    [
      asset.canonical_gloss,
      asset.word,
      ...asset.synonyms,
      ...(asset.aliases ?? []),
      ...(asset.alternate_spellings ?? []),
    ].map((term) => [normalize(term), asset] as const)
  )));

  lookup(assetId: string): SignAsset | undefined {
    return this.byId.get(assetId);
  }

  lookupGloss(gloss: string): SignAsset | undefined {
    return this.byGloss.get(normalize(gloss));
  }

  list(): readonly SignAsset[] {
    return ASSETS;
  }
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[_-]+/gu, ' ').replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/gu, ' ').trim();
}

export const signAssetRegistry = new AssetRegistry();
