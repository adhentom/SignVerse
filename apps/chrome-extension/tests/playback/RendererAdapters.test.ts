import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRenderer } from '../../playback/RendererFactory';
import { Mp4Adapter } from '../../playback/adapters/Mp4Adapter';
import { Avatar2DAdapter } from '../../playback/adapters/Avatar2DAdapter';
import { registerAvatarClip } from '../../playback/avatar/avatarClips';
import { createRendererForAsset } from '../../playback/RendererFactory';
import type { SignAsset } from '../../playback/types';
import { RendererSession } from '../../playback/RendererSession';

afterEach(() => vi.unstubAllGlobals());

describe('renderer adapters', () => {
  it('selects 2D and video implementations behind the shared interface', () => {
    expect(createRenderer('lottie').format).toBe('lottie');
    expect(createRenderer('svg-sequence').format).toBe('svg-sequence');
    expect(createRenderer('mp4').format).toBe('mp4');
  });

  it('selects the shared 3D renderer for GLB and VRM assets', () => {
    expect(createRenderer('glb').format).toBe('glb');
    expect(createRenderer('vrm').format).toBe('glb');
  });

  it('mounts, controls, seeks, and disposes real sign video media', async () => {
    const createObjectURL = vi.fn(() => 'blob:sign');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const target = document.createElement('div');
    const adapter = new Mp4Adapter();
    const mounting = adapter.mount(target, {
      metadata: {} as never,
      data: new Blob([new Uint8Array([1])], { type: 'video/mp4' }),
    }, false);
    const video = target.querySelector('video')!;
    Object.defineProperty(video, 'duration', { configurable: true, value: 4 });
    video.dispatchEvent(new Event('loadedmetadata'));
    await mounting;

    adapter.play(1.25);
    adapter.seek(0.5);
    adapter.pause();
    expect(play).toHaveBeenCalledOnce();
    expect(video.playbackRate).toBe(1.25);
    expect(video.currentTime).toBe(2);
    expect(pause).toHaveBeenCalled();

    adapter.destroy();
    expect(target.querySelector('video')).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:sign');
  });

  it('renders the professional interpreter with independently addressable finger joints', () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const target = document.createElement('div');
    const adapter = new Avatar2DAdapter();

    adapter.mountIdle(target, false);

    expect(target.querySelector('[data-avatar-part="head"]')).not.toBeNull();
    expect(target.querySelector('[data-avatar-part="left-index-mcp"]')).not.toBeNull();
    expect(target.querySelector('[data-avatar-part="left-index-pip"]')).not.toBeNull();
    expect(target.querySelector('[data-avatar-part="left-index-dip"]')).not.toBeNull();
    expect(target.querySelector('[data-avatar-part="right-little-mcp"]')).not.toBeNull();
    expect(target.querySelector('[data-avatar-part="left-thigh"]')).not.toBeNull();
    expect(target.querySelector('[data-avatar-part="right-thigh"]')).not.toBeNull();
    expect(target.querySelector('[data-avatar-part="left-clavicle"]')?.contains(
      target.querySelector('[data-avatar-part="left-upper-arm"]'),
    )).toBe(true);
    expect(target.querySelector('[data-avatar-part="torso"]')?.contains(
      target.querySelector('[data-avatar-part="neck"]'),
    )).toBe(true);
    expect(target.querySelector('[data-avatar-part="left-upper-arm"]')?.contains(
      target.querySelector('[data-avatar-part="left-forearm"]'),
    )).toBe(true);
    expect(target.querySelector('[data-avatar-part="left-forearm"]')?.contains(
      target.querySelector('[data-avatar-part="left-hand"]'),
    )).toBe(true);
    expect(target.querySelector('[data-avatar-part="left-hand"]')?.contains(
      target.querySelector('[data-avatar-part="left-index-mcp"]'),
    )).toBe(true);
    expect(target.querySelector('[data-avatar-part="right-upper-arm"]')?.contains(
      target.querySelector('[data-avatar-part="right-forearm"]'),
    )).toBe(true);
    expect(target.querySelector('[data-avatar-part="right-forearm"]')?.contains(
      target.querySelector('[data-avatar-part="right-hand"]'),
    )).toBe(true);
    expect(target.querySelector('[data-avatar-part="neck"]')?.contains(
      target.querySelector('[data-avatar-part="head"]'),
    )).toBe(true);
    adapter.dispose();
    expect(target.childElementCount).toBe(0);
  });

  it('uses the SVG avatar as the default MP4-backed renderer', () => {
    const base = {
      asset_id: 'asset', token_id: 'token', canonical_gloss: 'TOKEN', word: 'token',
      synonyms: [], language: 'ISL', category: 'test', display_name: 'Token', format: 'mp4',
      file_path: 'signs/token.mp4', source: 'signs/token.mp4', duration: 1, license: 'reviewed',
      version: '1', review_status: 'approved', transition: 'cut', handshape: 'reviewed',
      orientation: 'reviewed', facial_expression: 'reviewed', fallback: 'neutral-explanation',
      metadata: {},
    } satisfies SignAsset;
    expect(createRendererForAsset(base)).toBeInstanceOf(Avatar2DAdapter);

    const unregister = registerAvatarClip({
      id: 'reviewed-token', duration: 1,
      keyframes: [{ offset: 0, pose: {} }, { offset: 1, pose: {} }],
    });
    expect(createRendererForAsset({ ...base, metadata: { avatar_clip: 'reviewed-token' } })).toBeInstanceOf(Avatar2DAdapter);
    unregister();
  });

  it('rejects an unreviewed dataset asset without a retargeted avatar clip', async () => {
    const target = document.createElement('div');
    const adapter = new Avatar2DAdapter();
    await expect(adapter.mount(target, {
      metadata: {
        format: 'mp4',
        metadata: {},
        display_name: 'Dataset sign',
      } as unknown as SignAsset,
      data: new Blob([new Uint8Array([1])], { type: 'video/mp4' }),
    }, false)).rejects.toThrow('No validated avatar clip is registered');

    expect(target.querySelector('video')).toBeNull();
    adapter.destroy();
  });

  it('renders a pending retargeted clip as a labeled avatar preview without dataset video', async () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const target = document.createElement('div');
    const adapter = new Avatar2DAdapter(vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
        id: 'pending-preview', duration: 1,
        keyframes: [{ offset: 0, pose: {} }, { offset: 1, pose: {} }],
      }), { status: 200 }),
    ));

    await adapter.mount(target, {
      metadata: {
        format: 'mp4', display_name: 'Dataset sign', handshape: 'relaxed',
        metadata: { avatar_clip: 'animations/pending-preview.json' },
        native_review: { status: 'pending', reviewer: '', reviewed_at: '', notes: '' },
      } as unknown as SignAsset,
      data: new Blob([new Uint8Array([1])], { type: 'video/mp4' }),
    }, false);

    expect(target.querySelector('[data-avatar-profile]')?.getAttribute('data-isl-review-mode'))
      .toBe('preview');
    expect(target.querySelector('video')).toBeNull();
    adapter.destroy();
  });

  it('exposes the production renderer lifecycle without coupling it to the queue', async () => {
    const renderer = {
      format: 'svg-sequence' as const,
      mount: vi.fn().mockResolvedValue(undefined), play: vi.fn(), pause: vi.fn(),
      seek: vi.fn(), destroy: vi.fn(),
    };
    const session = new RendererSession(renderer);
    const target = document.createElement('div');
    const loaded = { metadata: {} as SignAsset, data: {} };
    session.initialize(target, true);
    await session.load(loaded);
    session.play(1.25);
    session.pause();
    session.resume(0.75);
    session.stop();
    session.dispose();

    expect(renderer.mount).toHaveBeenCalledWith(target, loaded, true);
    expect(renderer.play).toHaveBeenNthCalledWith(2, 0.75);
    expect(renderer.seek).toHaveBeenCalledWith(0);
    expect(renderer.destroy).toHaveBeenCalledOnce();
  });
});
