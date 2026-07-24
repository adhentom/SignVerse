import { describe, expect, it, vi } from 'vitest';
import { Avatar2DAdapter } from '../../playback/adapters/Avatar2DAdapter';
import { AvatarAssetManager } from '../../playback/avatar/assets';
import type { AvatarAssetProvider } from '../../playback/avatar/assets';
import type { SignAsset } from '../../playback/types';

const asset: SignAsset = {
  asset_id: 'hello',
  token_id: 'greeting-hello',
  canonical_gloss: 'HELLO',
  word: 'hello',
  synonyms: [],
  language: 'ISL',
  category: 'greetings',
  display_name: 'Hello',
  format: 'mp4',
  file_path: 'signs/hello.mp4',
  source: 'signs/hello.mp4',
  duration: 1,
  license: 'validated',
  version: '1',
  review_status: 'approved',
  transition: 'cut',
  handshape: 'open_palm',
  orientation: 'source-derived',
  facial_expression: 'neutral',
  fallback: 'sign-unavailable',
  metadata: { avatar_clip: 'animations/hello.json' },
};

describe('avatar asset pipeline integration', () => {
  it('routes visual, handshape, and animation assets through the centralized manager', async () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      id: 'HELLO',
      duration: 1,
      keyframes: [
        { offset: 0, pose: { 'left-hand': { rotation: 0 } } },
        { offset: 1, pose: { 'left-hand': { rotation: 20 } } },
      ],
    }), { status: 200 }));
    const manager = new AvatarAssetManager({ request });
    const adapter = new Avatar2DAdapter(request, undefined, manager);
    const target = document.createElement('div');

    await adapter.mount(target, { metadata: asset, data: {} }, false);

    expect(request).toHaveBeenCalledWith('animations/hello.json');
    expect(target.querySelector('svg')?.dataset.avatarProfile).toBe('adult-female');
    expect(manager.diagnostics()).toMatchObject({
      loadedAssets: 1,
      activeAssets: 2,
      validationFailureCount: 0,
    });
    adapter.destroy();
    expect(manager.diagnostics()).toMatchObject({ activeAssets: 0 });
    manager.dispose();
  });

  it('releases animation and visual leases when rig initialization fails', async () => {
    const invalidVisualProvider: AvatarAssetProvider = {
      kind: 'svg',
      supports: () => true,
      acquire: (profile, renderer) => ({
        asset: {
          kind: 'svg',
          profile: profile.id,
          rendererId: renderer.id,
          resource: document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
        },
        release: vi.fn(),
      }),
      dispose: vi.fn(),
    };
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      id: 'HELLO',
      duration: 1,
      keyframes: [
        { offset: 0, pose: {} },
        { offset: 1, pose: {} },
      ],
    }), { status: 200 }));
    const manager = new AvatarAssetManager({ request, providers: [invalidVisualProvider] });
    const adapter = new Avatar2DAdapter(request, undefined, manager);

    await expect(adapter.mount(
      document.createElement('div'),
      { metadata: asset, data: {} },
      false,
    )).rejects.toThrow();

    expect(manager.diagnostics()).toMatchObject({ activeAssets: 0 });
    adapter.destroy();
    manager.dispose();
  });
});
