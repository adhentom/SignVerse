import type { SignAsset } from './types';

const LOTTIE_SOURCE = 'avatar/signverse-avatar.json';

const ASSETS: SignAsset[] = [
  ['asset-placeholder-hello', 'greeting-hello', 'Hello'],
  ['asset-placeholder-thank-you', 'greeting-thank-you', 'Thank you'],
  ['asset-placeholder-welcome', 'greeting-welcome', 'Welcome'],
  ['asset-placeholder-help', 'action-help', 'Help'],
  ['asset-placeholder-school', 'education-school', 'School'],
  ['asset-placeholder-computer', 'technology-computer', 'Computer'],
  ['asset-placeholder-doctor', 'healthcare-doctor', 'Doctor'],
  ['asset-placeholder-one', 'number-one', 'One'],
  ['asset-placeholder-today', 'time-today', 'Today'],
  ['asset-placeholder-person', 'people-person', 'Person'],
].map(([asset_id, token_id, display_name]) => ({
  asset_id,
  token_id,
  display_name,
  format: 'lottie',
  source: LOTTIE_SOURCE,
  duration: 1.2,
  license: 'SignVerse demo asset; linguistic review pending',
  version: '1.0',
  review_status: 'draft',
}));

export class AssetRegistry {
  private readonly byId = new Map(ASSETS.map((asset) => [asset.asset_id, asset]));

  lookup(assetId: string): SignAsset | undefined {
    return this.byId.get(assetId);
  }

  list(): readonly SignAsset[] {
    return ASSETS;
  }
}

export const signAssetRegistry = new AssetRegistry();
