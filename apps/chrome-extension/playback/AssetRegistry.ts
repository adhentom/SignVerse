import type { SignAsset } from './types';

const HUMANOID_SOURCE = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/2bac6f8c57bf471df0d2a1e8a8ec023c7801dddf/Models/RiggedFigure/glTF-Binary/RiggedFigure.glb';

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
  format: 'glb',
  source: HUMANOID_SOURCE,
  duration: 1.2,
  license: 'CC BY 4.0 — © 2017 Cesium; demonstration motion, linguistic review pending',
  version: '1.0',
  review_status: 'draft',
  transition: 'cross-fade',
  handshape: 'pending native ISL review',
  orientation: 'pending native ISL review',
  facial_expression: 'pending native ISL review',
  fallback: 'fingerspell',
}));

ASSETS.push(...[
  ['asset-demo-welcome', 'demo-welcome', 'Welcome'],
  ['asset-demo-accessibility', 'demo-accessibility', 'Accessibility'],
  ['asset-demo-thank-you', 'demo-thank-you', 'Thank you'],
].map(([asset_id, token_id, display_name]) => ({
  asset_id,
  token_id,
  display_name,
  format: 'lottie' as const,
  source: 'avatar/signverse-avatar.json',
  duration: 1.2,
  license: 'SignVerse demonstration asset; not a validated ISL animation',
  version: '1.0',
  review_status: 'draft' as const,
  transition: 'cross-fade' as const,
  handshape: 'demonstration only',
  orientation: 'demonstration only',
  facial_expression: 'demonstration only',
  fallback: 'neutral-explanation' as const,
})));

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
