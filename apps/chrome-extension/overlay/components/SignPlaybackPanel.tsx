import { useEffect, useMemo, useState } from 'react';
import { signAssetRegistry } from '../../playback/AssetRegistry';
import { AVATAR_PROFILES, type AvatarProfileId } from '../../playback/avatarProfiles';
import { usePlaybackController } from '../../playback/usePlaybackController';
import type { InterpretationState, PlaybackSequence } from '../../shared/interpretation';
import { AvatarRenderer } from './AvatarRenderer';
import { CollapsibleCard } from './CollapsibleCard';
import { MalayalamCaptionTrack } from './MalayalamCaptionTrack';
import { UIIcon } from './UIIcon';
import { useAvatarPreference } from '../hooks/useAvatarPreference';
import { useInterpreterGeometry } from '../hooks/useInterpreterGeometry';

const EMPTY_SEQUENCE: PlaybackSequence = { items: [], unsupported_tokens: [] };
const INTERPRETER_PREFERENCES_KEY = 'signverse.interpreterPreferences';

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
}

function resolveAsset(item: PlaybackSequence['items'][number] | undefined) {
  if (!item) return undefined;
  const asset = signAssetRegistry.lookup(item.asset_id);
  return asset?.token_id === item.token_id && Math.abs(asset.duration - item.duration) < 0.01
    ? asset
    : undefined;
}

function PlaybackController({ sequence, caption, paused }: { sequence: PlaybackSequence; caption: string; paused: boolean }) {
  const controller = usePlaybackController(sequence);
  const { scheduled, snapshot, totalDuration } = controller;
  const current = scheduled?.item;
  const currentAsset = resolveAsset(current);
  const nextItem = sequence.items[(scheduled?.index ?? -1) + 1];
  const nextAsset = resolveAsset(nextItem);
  const missingAssets = useMemo(
    () => sequence.items
      .filter((item) => !resolveAsset(item))
      .map((item) => item.token_id),
    [sequence],
  );
  const unsupported = [...new Set([...sequence.unsupported_tokens, ...missingAssets])];
  const remaining = current ? Math.max(0, sequence.items.length - (scheduled?.index ?? 0) - 1) : 0;
  const completion = totalDuration > 0 ? Math.min(100, (snapshot.elapsed / totalDuration) * 100) : 0;
  const [reducedMotion, setReducedMotion] = useState(false);
  const [rendererAttempt, setRendererAttempt] = useState(0);
  const { profile, scale: avatarScale, select: selectAvatar, setScale: setAvatarScale } = useAvatarPreference();
  const { dock, expand, geometry, moveWithKeyboard, stageRef, startDrag } = useInterpreterGeometry();
  const [interpreterVisible, setInterpreterVisible] = useState(true);
  const [interpreterMinimized, setInterpreterMinimized] = useState(false);
  const [opacity, setOpacity] = useState(1);
  const [alwaysOnTop, setAlwaysOnTop] = useState(true);

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    let active = true;
    void chrome.storage.local.get(INTERPRETER_PREFERENCES_KEY)
      .then((stored) => {
        const value = stored[INTERPRETER_PREFERENCES_KEY] as Record<string, unknown> | undefined;
        if (!active || !value) return;
        if (typeof value.opacity === 'number') setOpacity(Math.min(1, Math.max(0.4, value.opacity)));
        if (typeof value.minimized === 'boolean') setInterpreterMinimized(value.minimized);
        if (typeof value.alwaysOnTop === 'boolean') setAlwaysOnTop(value.alwaysOnTop);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  function savePreferences(next: { opacity?: number; minimized?: boolean; alwaysOnTop?: boolean }) {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      void chrome.storage.local.set({
        [INTERPRETER_PREFERENCES_KEY]: {
          opacity, minimized: interpreterMinimized, alwaysOnTop, ...next,
        },
      }).catch(() => undefined);
    }
  }

  useEffect(() => {
    if (paused && snapshot.state === 'Playing') controller.pause();
  }, [paused, snapshot.state]);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  function handleKeyboard(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    if (event.key === ' ') {
      event.preventDefault();
      snapshot.state === 'Playing' ? controller.pause() : controller.play();
    } else if (event.key === 'ArrowRight') controller.seek(snapshot.elapsed + 0.5);
    else if (event.key === 'ArrowLeft') controller.seek(snapshot.elapsed - 0.5);
    else if (event.key === 'Home') controller.restart();
  }

  return (
    <div
      aria-label="ISL avatar playback controller"
      className="sv-player"
      onKeyDown={handleKeyboard}
      tabIndex={0}
    >
      <p className="sv-player-disclosure">
        Animated avatar demo · sign assets remain draft pending native ISL review
      </p>

      {!interpreterVisible && (
        <button className="sv-restore-interpreter" onClick={() => setInterpreterVisible(true)} type="button">
          Restore floating interpreter
        </button>
      )}
      {interpreterVisible && <div
        className={`sv-player-stage sv-interpreter-overlay ${interpreterMinimized ? 'sv-interpreter-overlay--minimized' : ''}`}
        ref={stageRef}
        style={{ left: geometry.x, opacity, top: geometry.y, width: geometry.width, height: interpreterMinimized ? 220 : geometry.height, zIndex: alwaysOnTop ? 2147483646 : 2147483000 }}
      >
        <button
          aria-label="Move interpreter; use arrow keys or drag"
          className="sv-avatar-drag-handle"
          onKeyDown={moveWithKeyboard}
          onPointerDown={startDrag}
          type="button"
        >SignVerse Interpreter · drag</button>
        <div className="sv-floating-controls" aria-label="Floating interpreter controls">
          <span aria-label="Connected" className="sv-floating-connection" />
          <button aria-label="Dock interpreter left" onClick={() => dock('left')} type="button">⇤</button>
          <button aria-label="Dock interpreter right" onClick={() => dock('right')} type="button">⇥</button>
          <button aria-label="Expand interpreter" onClick={expand} type="button">↗</button>
          <button aria-label={interpreterMinimized ? 'Restore interpreter' : 'Minimize interpreter'} onClick={() => setInterpreterMinimized((value) => { savePreferences({ minimized: !value }); return !value; })} type="button">—</button>
          <button aria-label="Close floating interpreter" onClick={() => setInterpreterVisible(false)} type="button">×</button>
        </div>
        <AvatarRenderer
          asset={currentAsset}
          nextAsset={nextAsset}
          onError={controller.fail}
          playing={snapshot.state === 'Playing'}
          profile={profile}
          progress={scheduled?.localProgress ?? 0}
          reducedMotion={reducedMotion}
          retryKey={rendererAttempt}
          speed={snapshot.speed}
        />
        <div className="sv-current-sign" aria-live="polite">
          <span>Current sign</span>
          <strong>{current?.token_id ?? 'No sign scheduled'}</strong>
          <small>{currentAsset
            ? `${currentAsset.format} · ${Math.round((current?.confidence ?? 0) * 100)}% confidence`
            : current ? 'Animation asset unavailable' : 'Waiting for a supported token'}</small>
          <p lang="ml">{caption.split('\n').at(-1) || 'മലയാള പരിഭാഷ ലഭ്യമല്ല.'}</p>
        </div>
        {!interpreterMinimized && <div className="sv-floating-playback">
          <button aria-label={snapshot.state === 'Playing' ? 'Pause floating interpreter' : 'Play floating interpreter'} onClick={snapshot.state === 'Playing' ? controller.pause : controller.play} type="button">
            <UIIcon name={snapshot.state === 'Playing' ? 'pause' : 'play'} />
          </button>
          <progress aria-label={`${Math.round(completion)} percent played`} max="100" value={completion} />
          <select aria-label="Floating interpreter avatar" onChange={(event) => selectAvatar(event.currentTarget.value as AvatarProfileId)} value={profile.id}>
            {AVATAR_PROFILES.map((avatar) => <option key={avatar.id} value={avatar.id}>{avatar.label}</option>)}
          </select>
          <label><span>Opacity</span><input aria-label="Floating interpreter opacity" max="1" min="0.4" onChange={(event) => { const next = Number(event.currentTarget.value); setOpacity(next); savePreferences({ opacity: next }); }} step="0.1" type="range" value={opacity} /></label>
          <label><span>Always on top</span><input aria-label="Always keep interpreter on top" checked={alwaysOnTop} onChange={(event) => { setAlwaysOnTop(event.currentTarget.checked); savePreferences({ alwaysOnTop: event.currentTarget.checked }); }} type="checkbox" /></label>
          <label><span>Avatar scale</span><input aria-label="Floating interpreter avatar scale" max="1.3" min="0.7" onChange={(event) => setAvatarScale(Number(event.currentTarget.value))} step="0.05" type="range" value={avatarScale} /></label>
        </div>}
      </div>}

      <label className="sv-avatar-select">
        <span>Interpreter avatar</span>
        <select aria-label="Interpreter avatar" onChange={(event) => selectAvatar(event.currentTarget.value as AvatarProfileId)} value={profile.id}>
          {AVATAR_PROFILES.map((avatar) => <option key={avatar.id} value={avatar.id}>{avatar.label}</option>)}
        </select>
      </label>

      {snapshot.state === 'Error' && (
        <div className="sv-playback-error" role="alert">
          <strong>Animation unavailable</strong>
          <span>{snapshot.error}</span>
          <button onClick={() => {
            setRendererAttempt((attempt) => attempt + 1);
            controller.restart();
          }} type="button">Retry playback</button>
        </div>
      )}

      <div className="sv-player-controls" aria-label="Playback controls">
        <button aria-label="Previous sign" disabled={!current || scheduled?.index === 0} onClick={controller.previous} type="button">
          <span className="sv-icon-previous"><UIIcon name="next" /></span>
        </button>
        <button aria-label="Restart sign sequence" disabled={!current} onClick={controller.restart} type="button">
          <UIIcon name="refresh" />
        </button>
        {snapshot.state === 'Playing' ? (
          <button aria-label="Pause sign sequence" onClick={controller.pause} type="button"><UIIcon name="pause" /></button>
        ) : (
          <button aria-label={snapshot.state === 'Paused' ? 'Resume sign sequence' : 'Play sign sequence'} disabled={!current} onClick={controller.play} type="button"><UIIcon name="play" /></button>
        )}
        <button aria-label="Next sign" disabled={!current || scheduled?.index === sequence.items.length - 1} onClick={controller.next} type="button">
          <UIIcon name="next" />
        </button>
        <label className="sv-speed-control">
          <span>Speed</span>
          <select aria-label="Playback speed" onChange={(event) => controller.setSpeed(Number(event.currentTarget.value))} value={snapshot.speed}>
            <option value="0.5">0.5×</option>
            <option value="0.75">0.75×</option>
            <option value="1">1×</option>
            <option value="1.25">1.25×</option>
            <option value="1.5">1.5×</option>
          </select>
        </label>
      </div>

      <div className="sv-player-stats">
        <span>{formatTime(snapshot.elapsed)} / {formatTime(totalDuration)}</span>
        <span>{remaining} remaining</span>
        <strong>{Math.round(completion)}%</strong>
      </div>
      <div className="sv-player-timeline">
        <input
          aria-label="Playback timeline"
          disabled={totalDuration === 0}
          max={totalDuration || 1}
          min="0"
          onChange={(event) => controller.seek(Number(event.currentTarget.value))}
          step="0.05"
          type="range"
          value={snapshot.elapsed}
        />
        <progress aria-label={`${Math.round(completion)} percent played`} max="100" value={completion} />
      </div>

      <MalayalamCaptionTrack
        caption={caption}
        currentIndex={scheduled?.index ?? 0}
        signCount={sequence.items.length}
      />

      <div className="sv-token-queue">
        <span>Playback order</span>
        {sequence.items.length > 0 ? (
          <ol>{sequence.items.map((item, index) => (
            <li aria-current={index === scheduled?.index ? 'step' : undefined} className={index === scheduled?.index ? 'sv-token--current' : ''} key={`${item.asset_id}-${index}`}>
              <span>{index + 1}</span>{item.token_id}
            </li>
          ))}</ol>
        ) : <p>No supported signs are available in this plan.</p>}
      </div>

      <div className="sv-unsupported">
        <span>Unsupported concepts</span>
        {unsupported.length > 0
          ? <ul>{unsupported.map((token) => <li key={token}>{token}</li>)}</ul>
          : <p>None detected</p>}
      </div>
      <p className="sv-player-shortcuts">Keyboard: Space play/pause · ←/→ seek · Home restart</p>
    </div>
  );
}

export function SignPlaybackPanel({ state, paused = false }: { state: InterpretationState; paused?: boolean }) {
  if (state.status === 'loading') {
    return (
      <section aria-busy="true" aria-live="polite" className="sv-card sv-player-skeleton">
        <span className="sv-visually-hidden">Preparing ISL playback</span>
        <div className="sv-skeleton-player" />
        <div className="sv-skeleton-controls" />
      </section>
    );
  }

  const sequence = state.status === 'ready' ? state.response.playback ?? EMPTY_SEQUENCE : EMPTY_SEQUENCE;
  const glossCount = state.status === 'ready' ? state.response.isl_gloss.length : 0;
  const caption = state.status === 'ready' ? state.response.malayalam_translation : '';

  return (
    <CollapsibleCard badge={`${sequence.items.length || glossCount} signs`} defaultExpanded icon="translate" title="ISL Playback">
      <PlaybackController caption={caption} paused={paused} sequence={sequence} />
    </CollapsibleCard>
  );
}
