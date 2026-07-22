import { memo, useEffect, useRef, useState } from 'react';
import { signAssetLoader } from '../../playback/AssetLoader';
import { createRendererForAsset } from '../../playback/RendererFactory';
import { Avatar2DAdapter } from '../../playback/adapters/Avatar2DAdapter';
import { RendererSession } from '../../playback/RendererSession';
import type { PlaybackItem } from '../../shared/interpretation';
import type { RendererState, SignAsset } from '../../playback/types';
import type { AvatarProfile } from '../../playback/avatarProfiles';
import { isNativeApproved } from '../../playback/nativeReview';

interface AvatarRendererProps {
  asset?: SignAsset;
  nextAsset?: SignAsset;
  cue?: PlaybackItem;
  cueIndex?: number;
  playing: boolean;
  progress: number;
  reducedMotion: boolean;
  retryKey: number;
  speed: number;
  onError(message: string): void;
  profile: AvatarProfile;
}

async function mountWithTimeout(operation: Promise<void>): Promise<void> {
  let timeout = 0;
  try {
    await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeout = window.setTimeout(
          () => reject(new Error('The animation renderer timed out.')),
          5_000,
        );
      }),
    ]);
  } finally {
    window.clearTimeout(timeout);
  }
}

export const AvatarRenderer = memo(function AvatarRenderer({
  asset,
  nextAsset,
  cue,
  cueIndex,
  playing,
  progress,
  reducedMotion,
  retryKey,
  speed,
  onError,
  profile,
}: AvatarRendererProps) {
  const target = useRef<HTMLDivElement>(null);
  const layerA = useRef<HTMLDivElement>(null);
  const layerB = useRef<HTMLDivElement>(null);
  const renderers = useRef<Array<RendererSession | undefined>>([]);
  const idleRenderer = useRef<Avatar2DAdapter | undefined>(undefined);
  const activeSlot = useRef(0);
  const generation = useRef(0);
  const transitionTimer = useRef(0);
  const [state, setState] = useState<RendererState>('Idle');

  useEffect(() => {
    signAssetLoader.preload(nextAsset);
  }, [nextAsset]);

  useEffect(() => {
    const request = ++generation.current;
    const layers = [layerA.current, layerB.current];
    if (!asset || !layers[0] || !layers[1]) {
      renderers.current.forEach((renderer) => renderer?.dispose());
      renderers.current = [];
      layers.forEach((layer) => layer?.replaceChildren());
      idleRenderer.current?.destroy();
      idleRenderer.current = new Avatar2DAdapter(fetch, profile);
      if (layers[0]) {
        layers[0].style.opacity = '1';
        idleRenderer.current.mountIdle(layers[0], reducedMotion);
      }
      setState('Idle');
      return;
    }

    setState('Loading');
    console.info('[SignVerse] avatar_asset_load_started', {
      assetId: asset.asset_id,
      nextAssetId: nextAsset?.asset_id ?? null,
    });
    void signAssetLoader.load(asset)
      .then(async (loaded) => {
        if (request !== generation.current) return;
        const previousSlot = activeSlot.current;
        const nextSlot = renderers.current[previousSlot] ? 1 - previousSlot : previousSlot;
        const nextLayer = layers[nextSlot];
        const previousLayer = layers[previousSlot];
        if (!nextLayer) return;
        renderers.current[nextSlot]?.dispose();
        nextLayer.replaceChildren();
        nextLayer.style.opacity = '0';
        idleRenderer.current?.destroy();
        idleRenderer.current = undefined;
        const nextRenderer = new RendererSession(createRendererForAsset(asset, profile));
        nextRenderer.initialize(nextLayer, reducedMotion);
        const transitionPose = renderers.current[previousSlot]?.capturePose() ?? {};
        nextRenderer.setTransitionSource(transitionPose);
        if (cue) nextRenderer.setPlaybackContext(cue);
        try {
          await mountWithTimeout(nextRenderer.load(loaded));
        } catch (error) {
          nextRenderer.dispose();
          throw error;
        }
        if (request !== generation.current) {
          nextRenderer.dispose();
          return;
        }
        nextRenderer.seek(reducedMotion ? 1 : progress);
        renderers.current[nextSlot] = nextRenderer;
        activeSlot.current = nextSlot;
        window.clearTimeout(transitionTimer.current);
        const transitionDuration = reducedMotion ? 0 : cue?.transition_ms ?? 180;
        nextLayer.style.transitionDuration = `${transitionDuration}ms`;
        if (previousLayer) previousLayer.style.transitionDuration = `${transitionDuration}ms`;
        nextLayer.style.opacity = '1';
        if (previousLayer && previousSlot !== nextSlot) previousLayer.style.opacity = '0';
        transitionTimer.current = window.setTimeout(() => {
          if (previousSlot === activeSlot.current) return;
          renderers.current[previousSlot]?.dispose();
          renderers.current[previousSlot] = undefined;
          previousLayer?.replaceChildren();
        }, transitionDuration);
        setState(playing && !reducedMotion ? 'Playing' : 'Paused');
        console.info('[SignVerse] avatar_renderer_mounted', {
          assetId: asset.asset_id,
          state: playing && !reducedMotion ? 'Playing' : 'Paused',
        });
      })
      .catch((error: unknown) => {
        if (request !== generation.current) return;
        const message = error instanceof Error ? error.message : 'The sign animation failed.';
        renderers.current.forEach((renderer) => renderer?.dispose());
        renderers.current = [];
        layers.forEach((layer) => layer?.replaceChildren());
        const idleLayer = layers[0];
        if (idleLayer) {
          idleLayer.style.opacity = '1';
          idleRenderer.current?.destroy();
          idleRenderer.current = new Avatar2DAdapter(fetch, profile);
          idleRenderer.current.mountIdle(idleLayer, reducedMotion);
        }
        console.error('[SignVerse] avatar_renderer_failed', {
          assetId: asset.asset_id,
          message,
          fallback: 'branded-avatar-idle',
        });
        setState('Error');
        onError(message);
      });
  }, [asset?.asset_id, cueIndex, profile.id, reducedMotion, retryKey]);

  useEffect(() => {
    if (cue) renderers.current[activeSlot.current]?.setPlaybackContext(cue);
  }, [cue]);

  useEffect(() => () => {
    generation.current += 1;
    window.clearTimeout(transitionTimer.current);
    renderers.current.forEach((renderer) => renderer?.dispose());
    idleRenderer.current?.destroy();
    renderers.current = [];
  }, []);

  useEffect(() => {
    const activeRenderer = renderers.current[activeSlot.current];
    if (!activeRenderer || state === 'Loading' || state === 'Error') return;
    activeRenderer.seek(reducedMotion ? 1 : progress);
    if (playing && !reducedMotion) {
      activeRenderer.play(speed);
      setState('Playing');
    } else {
      activeRenderer.pause();
      setState('Paused');
    }
  }, [playing, progress, reducedMotion, speed, state]);

  return (
    <div className={`sv-avatar-shell${asset ? '' : ' sv-avatar-shell--empty'}`}>
      <div
        aria-label={asset ? `ISL interpreter playing ${asset.display_name}` : 'SignVerse interpreter ready'}
        aria-busy={state === 'Loading'}
        className="sv-avatar-renderer"
        ref={target}
        role="img"
      >
        <div className="sv-renderer-layer sv-renderer-layer--active" ref={layerA} />
        <div className="sv-renderer-layer" ref={layerB} />
      </div>
      {!asset && <div className="sv-avatar-empty" role="status">Waiting for a mapped ISL sign</div>}
      {state === 'Loading' && <div className="sv-avatar-loading" aria-live="polite">Loading avatar…</div>}
      {state === 'Error' && <div className="sv-avatar-fallback" aria-hidden="true">Sign unavailable</div>}
      {asset && state !== 'Error' && !isNativeApproved(asset) && (
        <div className="sv-avatar-review-badge" role="status">
          Animation preview · pending native ISL review
        </div>
      )}
      <span aria-live="polite" className="sv-visually-hidden">Interpreter {state.toLowerCase()}</span>
    </div>
  );
});
