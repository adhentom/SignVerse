import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlaybackItem } from '../../shared/interpretation';
import type {
  AvatarPoseSnapshot,
  LoadedAsset,
  Renderer,
  SignAsset,
} from '../../playback/types';
import {
  RendererSupervisor,
  isTransientRendererError,
} from '../../playback/avatar/runtime';

function loadedAsset(): LoadedAsset {
  return {
    metadata: {
      asset_id: 'asset-supervisor',
      display_name: 'Supervisor fixture',
    } as SignAsset,
    data: {},
  };
}

function renderer(
  mount: Renderer['mount'] = vi.fn<Renderer['mount']>().mockResolvedValue(undefined),
): Renderer {
  return {
    format: 'svg-sequence',
    mount,
    play: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(),
    destroy: vi.fn(),
    setPlaybackContext: vi.fn(),
    setTransitionSource: vi.fn(),
    capturePose: vi.fn(() => ({})),
  };
}

async function waitForRecovery(mount: Renderer['mount'], expectedCalls: number): Promise<void> {
  await vi.waitFor(() => expect(mount).toHaveBeenCalledTimes(expectedCalls));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RendererSupervisor', () => {
  it('retries a transient mount failure exactly once and then succeeds', async () => {
    const mount = vi.fn<Renderer['mount']>()
      .mockRejectedValueOnce(new Error('Renderer initialization timed out.'))
      .mockResolvedValueOnce(undefined);
    const delegate = renderer(mount);
    const supervisor = new RendererSupervisor(delegate);

    await supervisor.mount(document.createElement('div'), loadedAsset(), false);

    expect(mount).toHaveBeenCalledTimes(2);
    expect(delegate.destroy).toHaveBeenCalledOnce();
    expect(supervisor.getRenderingDiagnostics().health).toMatchObject({
      recoveryAttempts: 1,
      fatalErrorCount: 0,
    });
    supervisor.destroy();
  });

  it.each([
    'Animation asset integrity verification failed.',
    'Animation clip is corrupted.',
    'Avatar animation failed native ISL review.',
    'SVG avatar visual asset is unavailable.',
    'This renderer version is unsupported.',
    'No validated avatar clip is registered.',
  ])('does not retry a permanent failure: %s', async (message) => {
    const mount = vi.fn<Renderer['mount']>().mockRejectedValue(new Error(message));
    const delegate = renderer(mount);
    const supervisor = new RendererSupervisor(delegate);

    await expect(
      supervisor.mount(document.createElement('div'), loadedAsset(), false),
    ).rejects.toThrow(message);

    expect(mount).toHaveBeenCalledOnce();
    expect(supervisor.getRenderingDiagnostics().health).toMatchObject({
      recoveryAttempts: 0,
      fatalErrorCount: 1,
    });
    supervisor.destroy();
  });

  it('classifies only transient failures as retryable', () => {
    expect(isTransientRendererError(new Error('Temporary renderer initialization failure')))
      .toBe(true);
    expect(isTransientRendererError(new Error('Animation clip is corrupted')))
      .toBe(false);
    expect(isTransientRendererError(new Error('Asset integrity mismatch')))
      .toBe(false);
    expect(isTransientRendererError(new Error('Pending native ISL review')))
      .toBe(false);
    expect(isTransientRendererError(new Error('Renderer unavailable')))
      .toBe(false);
  });

  it('restores playback context, pose, progress, speed, and state after WebGL recovery', async () => {
    const target = document.createElement('div');
    const canvases: HTMLCanvasElement[] = [];
    const mount = vi.fn<Renderer['mount']>(async (mountTarget) => {
      const canvas = document.createElement('canvas');
      canvases.push(canvas);
      mountTarget.append(canvas);
    });
    const delegate = renderer(mount);
    const supervisor = new RendererSupervisor(delegate);
    const context = {
      token_id: 'isl:hello',
      asset_id: 'asset-hello',
      duration: 1,
      confidence: 0.96,
    } satisfies PlaybackItem;
    const pose: AvatarPoseSnapshot = {
      'left-hand': { rotation: 28 },
    };

    supervisor.setPlaybackContext?.(context);
    supervisor.setTransitionSource?.(pose);
    await supervisor.mount(target, loadedAsset(), false);
    supervisor.seek(0.42);
    supervisor.play(1.5);

    const originalCanvas = canvases[0]!;
    const loss = new Event('webglcontextlost', { cancelable: true });
    originalCanvas.dispatchEvent(loss);
    expect(loss.defaultPrevented).toBe(true);
    expect(delegate.pause).toHaveBeenCalled();

    originalCanvas.dispatchEvent(new Event('webglcontextrestored'));
    await waitForRecovery(mount, 2);

    expect(delegate.setPlaybackContext).toHaveBeenLastCalledWith(context);
    expect(delegate.setTransitionSource).toHaveBeenLastCalledWith(pose);
    expect(delegate.seek).toHaveBeenLastCalledWith(0.42);
    expect(delegate.play).toHaveBeenLastCalledWith(1.5);
    expect(supervisor.getRenderingDiagnostics().health).toMatchObject({
      recoveryAttempts: 1,
      fatalErrorCount: 0,
    });

    supervisor.destroy();
    originalCanvas.dispatchEvent(new Event('webglcontextrestored'));
    await Promise.resolve();
    expect(mount).toHaveBeenCalledTimes(2);
  });

  it('bounds retries during context restoration and records a fatal recovery', async () => {
    const target = document.createElement('div');
    let originalCanvas: HTMLCanvasElement | undefined;
    const mount = vi.fn<Renderer['mount']>(async (mountTarget) => {
      if (mount.mock.calls.length > 1) {
        throw new Error('Temporary context recreation failure');
      }
      originalCanvas = document.createElement('canvas');
      mountTarget.append(originalCanvas);
    });
    const delegate = renderer(mount);
    const supervisor = new RendererSupervisor(delegate);
    await supervisor.mount(target, loadedAsset(), false);

    originalCanvas!.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    originalCanvas!.dispatchEvent(new Event('webglcontextrestored'));
    await waitForRecovery(mount, 3);
    await vi.waitFor(() => {
      expect(supervisor.getRenderingDiagnostics().health?.fatalErrorCount).toBe(1);
    });

    // Initial mount plus one recovery attempt and exactly one retry.
    expect(mount).toHaveBeenCalledTimes(3);
    expect(supervisor.getRenderingDiagnostics().health).toMatchObject({
      recoveryAttempts: 2,
      fatalErrorCount: 1,
    });
    supervisor.destroy();
  });

  it('removes context listeners deterministically on destruction', async () => {
    const target = document.createElement('div');
    const canvas = document.createElement('canvas');
    const add = vi.spyOn(canvas, 'addEventListener');
    const remove = vi.spyOn(canvas, 'removeEventListener');
    const mount = vi.fn<Renderer['mount']>(async (mountTarget) => {
      mountTarget.append(canvas);
    });
    const supervisor = new RendererSupervisor(renderer(mount));
    await supervisor.mount(target, loadedAsset(), false);

    expect(add).toHaveBeenCalledWith('webglcontextlost', expect.any(Function));
    expect(add).toHaveBeenCalledWith('webglcontextrestored', expect.any(Function));

    supervisor.destroy();

    expect(remove).toHaveBeenCalledWith('webglcontextlost', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('webglcontextrestored', expect.any(Function));
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    await Promise.resolve();
    expect(mount).toHaveBeenCalledOnce();
  });

  it('does not retry a late mount failure after the session has been destroyed', async () => {
    let rejectMount: ((error: Error) => void) | undefined;
    const mount = vi.fn<Renderer['mount']>(() => new Promise<void>((_resolve, reject) => {
      rejectMount = reject;
    }));
    const delegate = renderer(mount);
    const supervisor = new RendererSupervisor(delegate);
    const mounting = supervisor.mount(document.createElement('div'), loadedAsset(), false);

    supervisor.destroy();
    rejectMount?.(new Error('Late transient initialization failure'));
    await expect(mounting).resolves.toBeUndefined();

    expect(mount).toHaveBeenCalledOnce();
    expect(supervisor.getRenderingDiagnostics().health).toMatchObject({
      recoveryAttempts: 0,
      fatalErrorCount: 0,
    });
  });
});
