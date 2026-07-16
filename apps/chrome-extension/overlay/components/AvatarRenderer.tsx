import { memo, useEffect, useRef, useState } from 'react';
import { signAssetLoader } from '../../playback/AssetLoader';
import { createRenderer } from '../../playback/RendererFactory';
import type { RendererState, SignAsset } from '../../playback/types';
import type { AvatarProfile } from '../../playback/avatarProfiles';

interface AvatarRendererProps {
  asset?: SignAsset;
  profile: AvatarProfile;
  nextAsset?: SignAsset;
  playing: boolean;
  progress: number;
  reducedMotion: boolean;
  retryKey: number;
  speed: number;
  onError(message: string): void;
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
  profile,
  nextAsset,
  playing,
  progress,
  reducedMotion,
  retryKey,
  speed,
  onError,
}: AvatarRendererProps) {
  const target = useRef<HTMLDivElement>(null);
  const renderer = useRef<ReturnType<typeof createRenderer> | undefined>(undefined);
  const [state, setState] = useState<RendererState>('Idle');

  useEffect(() => {
    signAssetLoader.preload(nextAsset);
  }, [nextAsset]);

  useEffect(() => {
    let active = true;
    renderer.current?.destroy();
    renderer.current = undefined;
    target.current?.replaceChildren();
    if (!asset || !target.current) {
      setState('Idle');
      return;
    }

    setState('Loading');
    void signAssetLoader.load(asset)
      .then(async (loaded) => {
        if (!active || !target.current) return;
        const nextRenderer = createRenderer(asset.format, profile);
        renderer.current = nextRenderer;
        await mountWithTimeout(nextRenderer.mount(target.current, loaded, reducedMotion));
        if (!active) {
          nextRenderer.destroy();
          return;
        }
        nextRenderer.seek(reducedMotion ? 1 : progress);
        setState(playing && !reducedMotion ? 'Playing' : 'Paused');
      })
      .catch((error: unknown) => {
        if (!active) {
          renderer.current?.destroy();
          return;
        }
        const message = error instanceof Error ? error.message : 'The sign animation failed.';
        renderer.current?.destroy();
        renderer.current = undefined;
        setState('Error');
        onError(message);
      });

    return () => {
      active = false;
      renderer.current?.destroy();
      renderer.current = undefined;
    };
  }, [asset?.asset_id, profile.id, reducedMotion, retryKey]);

  useEffect(() => {
    const activeRenderer = renderer.current;
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
    <div className="sv-avatar-shell">
      <div
        aria-label={asset ? `Animated avatar for ${asset.display_name}` : 'Avatar unavailable'}
        aria-busy={state === 'Loading'}
        className="sv-avatar-renderer"
        ref={target}
        role="img"
      />
      {state === 'Loading' && <div className="sv-avatar-loading" aria-live="polite">Loading avatar…</div>}
      {state === 'Error' && <div className="sv-avatar-fallback" aria-hidden="true">Sign unavailable</div>}
      <span className={`sv-renderer-state sv-renderer-state--${state.toLowerCase()}`}>{state}</span>
    </div>
  );
});
