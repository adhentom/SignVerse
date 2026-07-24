import { afterEach, describe, expect, it, vi } from 'vitest';
import { Avatar2DAdapter } from '../../playback/adapters/Avatar2DAdapter';
import { AvatarAnimationEngine } from '../../playback/avatar/AvatarAnimationEngine';
import animationLibrary from '../../playback/avatar/assets/animations.json';
import avatarManifest from '../../playback/avatar/assets/avatar.manifest.json';
import expressionLibrary from '../../playback/avatar/assets/expressions.json';
import handshapeLibrary from '../../playback/avatar/assets/handshapes.json';
import transitionLibrary from '../../playback/avatar/assets/transitions.json';
import {
  AvatarAssetManager,
  type AvatarAssetBundle,
} from '../../playback/avatar/assets';
import { createSignVerseInterpreterSvg } from '../../playback/avatar/signVerseInterpreter/createSignVerseInterpreterSvg';
import { SIGNVERSE_ARM_BIND_ROTATION } from '../../playback/avatar/signVerseInterpreter/interpreterGeometry';
import type { SignAsset } from '../../playback/types';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('production avatar rendering integration', () => {
  it('consumes playback metadata and exposes rendering metrics without UI coupling', async () => {
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      id: 'hello-production',
      duration: 1,
      keyframes: [
        { offset: 0, pose: { 'left-upper-arm': { rotation: 10 } } },
        { offset: 1, pose: { 'left-upper-arm': { rotation: 70 } } },
      ],
    }), { status: 200 }));
    const adapter = new Avatar2DAdapter(request);
    adapter.setPlaybackContext({
      token_id: 'isl:hello',
      asset_id: 'asset-hello',
      duration: 1,
      confidence: 0.95,
      transition_ms: 240,
      non_manual_markers: [{
        marker: 'brow-raise',
        value: 'question',
        scope: 'phrase',
        timing: 'throughout',
        intensity: 0.8,
      }],
    });
    adapter.setTransitionSource({ 'left-upper-arm': { rotation: -20 } });
    const target = document.createElement('div');
    await adapter.mount(target, {
      metadata: {
        format: 'mp4',
        display_name: 'Hello',
        handshape: 'open',
        metadata: {
          avatar_clip: 'animations/hello-production.json',
          motion_profile: 'expressive',
          transition_profile: 'emphasis',
        },
        native_review: {
          status: 'approved',
          reviewer: 'Reviewer',
          reviewed_at: '2026-07-24',
          notes: 'Approved fixture',
        },
      } as unknown as SignAsset,
      data: {},
    }, false);

    frame?.(16);
    expect(adapter.getRenderingDiagnostics()).toMatchObject({
      activeAnimation: 'hello-production',
      animationQueueDepth: 1,
      blendDurationMs: 240,
      motion: {
        activeMotionProfile: 'expressive',
        activeTransitionProfile: 'emphasis',
        coArticulationUsage: 1,
      },
    });
    expect(target.querySelector('[data-avatar-part="left-index-mcp"]')).not.toBeNull();
    expect(target.querySelector('[data-avatar-mouth="neutral"]')).not.toBeNull();
    adapter.destroy();
    expect(target.childElementCount).toBe(0);
  });

  it('recovers smoothly to idle, resumes, and interrupts stale motion on seek', async () => {
    let frame: FrameRequestCallback | undefined;
    const cancel = vi.fn();
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      frame = callback;
      return 7;
    }));
    vi.stubGlobal('cancelAnimationFrame', cancel);
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      id: 'motion-lifecycle',
      duration: 1,
      keyframes: [
        {
          offset: 0,
          pose: {
            'left-upper-arm': { rotation: 80 },
            'left-forearm': { rotation: -65 },
            'left-hand': { rotation: 30 },
          },
        },
        {
          offset: 1,
          pose: {
            'left-upper-arm': { rotation: 150 },
            'left-forearm': { rotation: -115 },
            'left-hand': { rotation: 70 },
          },
        },
      ],
    }), { status: 200 }));
    const adapter = new Avatar2DAdapter(request);
    const target = document.createElement('div');
    await adapter.mount(target, {
      metadata: {
        format: 'mp4',
        display_name: 'Motion lifecycle',
        handshape: 'open',
        metadata: { avatar_clip: 'animations/motion-lifecycle.json' },
        native_review: {
          status: 'approved',
          reviewer: 'Reviewer',
          reviewed_at: '2026-07-24',
          notes: 'Approved fixture',
        },
      } as unknown as SignAsset,
      data: {},
    }, false);

    frame?.(100);
    expect(adapter.capturePose()['left-upper-arm']?.rotation)
      .not.toBe(SIGNVERSE_ARM_BIND_ROTATION.left);

    adapter.pause();
    frame?.(500);
    expect(adapter.capturePose()['left-upper-arm']?.rotation)
      .toBeCloseTo(SIGNVERSE_ARM_BIND_ROTATION.left, 6);

    adapter.resume(1);
    frame?.(550);
    const transitionsAfterResume =
      adapter.getRenderingDiagnostics().motion?.coArticulationUsage ?? 0;
    expect(transitionsAfterResume).toBeGreaterThan(0);

    adapter.seek(0.85);
    const transitionsAfterSeek =
      adapter.getRenderingDiagnostics().motion?.coArticulationUsage ?? 0;
    expect(transitionsAfterSeek).toBeGreaterThan(transitionsAfterResume);

    adapter.destroy();
    expect(cancel).toHaveBeenCalled();
    expect(target.childElementCount).toBe(0);
  });

  it('scales co-articulation with playback speed', () => {
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const clip = {
      id: 'speed-aware',
      duration: 1,
      keyframes: [
        { offset: 0, pose: { 'left-hand': { rotation: 0 } } },
        { offset: 1, pose: { 'left-hand': { rotation: 90 } } },
      ],
    };
    const fast = new AvatarAnimationEngine(createSignVerseInterpreterSvg(), clip);
    const fastSource = fast.snapshotPose();
    fastSource['left-hand'] = { rotation: -40 };
    fast.configureTransition(200, 1_000);
    fast.setTransitionSource(fastSource);
    fast.play(2);
    callbacks.shift()?.(100);
    expect(fast.diagnostics().motion?.activeCoArticulation).toBe(false);
    fast.dispose();

    callbacks.length = 0;
    const slow = new AvatarAnimationEngine(createSignVerseInterpreterSvg(), clip);
    const slowSource = slow.snapshotPose();
    slowSource['left-hand'] = { rotation: -40 };
    slow.configureTransition(200, 1_000);
    slow.setTransitionSource(slowSource);
    slow.play(0.25);
    callbacks.shift()?.(100);
    expect(slow.diagnostics().motion?.activeCoArticulation).toBe(true);
    slow.dispose();
  });

  it('blends the first sign from the canonical neutral pose when no prior renderer exists', () => {
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const engine = new AvatarAnimationEngine(createSignVerseInterpreterSvg(), {
      id: 'first-sign',
      duration: 1,
      keyframes: [
        { offset: 0, pose: { 'left-upper-arm': { rotation: 85 } } },
        { offset: 1, pose: { 'left-upper-arm': { rotation: 110 } } },
      ],
    });
    engine.configureTransition(200, 1_000);
    engine.setTransitionSource({});
    engine.play();
    callbacks.shift()?.(16);

    expect(engine.diagnostics().motion).toMatchObject({
      activeCoArticulation: true,
      coArticulationUsage: 1,
    });
    const firstFrameRotation = engine.snapshotPose()['left-upper-arm']?.rotation;
    expect(firstFrameRotation).toBeDefined();
    expect(Math.abs(firstFrameRotation! - SIGNVERSE_ARM_BIND_ROTATION.left)).toBeLessThan(1);
    expect(Math.abs(firstFrameRotation! - 85)).toBeGreaterThan(10);
    engine.dispose();
  });

  it('uses governed transition metadata and detects a repeated sign across renderers', async () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const bundle = structuredClone({
      manifest: avatarManifest,
      animations: animationLibrary,
      handshapes: handshapeLibrary,
      expressions: expressionLibrary,
      transitions: transitionLibrary,
    }) as AvatarAssetBundle;
    bundle.animations = [{
      id: 'REPEAT',
      source: 'animations/repeat.json',
      duration: 1,
      defaultBlendProfile: 'slow',
      transitionProfile: 'slow',
      expressionProfile: 'neutral',
      requiredHandshape: 'open_palm',
      version: '1.0',
    }];
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      id: 'REPEAT',
      duration: 1,
      keyframes: [
        { offset: 0, pose: { 'left-hand': { rotation: 0 } } },
        { offset: 1, pose: { 'left-hand': { rotation: 50 } } },
      ],
    }), { status: 200 }));
    const manager = new AvatarAssetManager({ bundle, request });
    const repeatedAsset = {
      format: 'mp4',
      display_name: 'Repeated sign',
      handshape: 'open_palm',
      metadata: {
        avatar_clip: 'animations/repeat.json',
        avatar_clip_id: 'REPEAT',
        motion_profile: 'expressive',
        transition_profile: 'fast',
      },
      native_review: {
        status: 'approved',
        reviewer: 'Reviewer',
        reviewed_at: '2026-07-24',
        notes: 'Approved fixture',
      },
    } as unknown as SignAsset;
    const cue = {
      token_id: 'REPEAT',
      asset_id: 'repeat',
      duration: 0.2,
      confidence: 1,
    };
    const first = new Avatar2DAdapter(request, undefined, manager);
    first.setPlaybackContext(cue);
    await first.mount(document.createElement('div'), {
      metadata: repeatedAsset,
      data: {},
    }, false);
    first.seek(0.4);

    const second = new Avatar2DAdapter(request, undefined, manager);
    second.setTransitionSource(first.capturePose());
    second.setPlaybackContext(cue);
    await second.mount(document.createElement('div'), {
      metadata: repeatedAsset,
      data: {},
    }, false);
    second.seek(0);

    expect(second.getRenderingDiagnostics()).toMatchObject({
      blendDurationMs: 70,
      motion: {
        activeMotionProfile: 'educational',
        activeTransitionProfile: 'slow',
        repeatedSignTransitions: 1,
      },
    });
    expect(request).toHaveBeenCalledTimes(1);
    first.destroy();
    second.destroy();
    manager.dispose();
  });

  it('preserves the captured source pose before secondary motion begins', () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const engine = new AvatarAnimationEngine(createSignVerseInterpreterSvg(), {
      id: 'source-endpoint',
      duration: 1,
      keyframes: [
        { offset: 0, pose: { 'left-upper-arm': { rotation: 20 } } },
        { offset: 1, pose: { 'left-upper-arm': { rotation: 100 } } },
      ],
    });
    const source = engine.snapshotPose();
    Object.assign(source, {
      'left-clavicle': { rotation: 3 },
      'left-upper-arm': { rotation: 145 },
      'left-forearm': { rotation: -70 },
      torso: { rotation: 2 },
      head: { rotation: 5 },
    });

    engine.configureTransition(180, 1_000);
    engine.setTransitionSource(source);
    engine.seek(0);

    expect(engine.snapshotPose()).toMatchObject({
      'left-clavicle': { rotation: 3 },
      'left-upper-arm': { rotation: 145 },
      'left-forearm': { rotation: -70 },
      torso: { rotation: 2 },
      head: { rotation: 5 },
    });
    engine.dispose();
  });
});
