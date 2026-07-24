import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  avatarClipCacheSize,
  clearAvatarClipCache,
  loadAvatarClip,
} from '../../playback/avatar/avatarClips';

afterEach(() => clearAvatarClipCache());

describe('avatar clip cache', () => {
  it('loads lazily and reuses a validated clip request', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      id: 'cached-sign',
      duration: 1,
      keyframes: [{ offset: 0, pose: {} }, { offset: 1, pose: {} }],
    }), { status: 200 }));

    const first = loadAvatarClip('animations/cached-sign.json', request);
    const second = loadAvatarClip('animations/cached-sign.json', request);

    expect(first).toBe(second);
    await expect(first).resolves.toMatchObject({ id: 'cached-sign' });
    expect(request).toHaveBeenCalledOnce();
    expect(avatarClipCacheSize()).toBe(1);
  });
});
