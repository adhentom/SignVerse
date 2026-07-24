import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { signAssetRegistry } from '../../playback/AssetRegistry';
import { usePlaybackController } from '../../playback/usePlaybackController';
import type { InterpretationState, PlaybackSequence } from '../../shared/interpretation';
import { AvatarRenderer } from './AvatarRenderer';
import { CollapsibleCard } from './CollapsibleCard';
import { EnglishCaptionTrack, FloatingCaption } from './EnglishCaptionTrack';
import { UIIcon } from './UIIcon';
import { useInterpreterGeometry } from '../hooks/useInterpreterGeometry';
import { DEFAULT_AVATAR, type AvatarProfile } from '../../playback/avatarProfiles';

const EMPTY_SEQUENCE: PlaybackSequence = { items: [], unsupported_tokens: [] };

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
}

function resolveAsset(item: PlaybackSequence['items'][number] | undefined) {
  if (!item) return undefined;
  // The backend keeps the governed lexicon token ID on the playback item, while
  // gloss lookup may select a dataset asset with a different token ID. The asset
  // ID is the registry's unique playback key; requiring both IDs to match rejects
  // valid gloss-to-dataset mappings before they reach the renderer.
  return signAssetRegistry.lookup(item.asset_id);
}

function PlaybackController({ sequence, sourceStatus, sourceText, paused, portalTarget, profile, floatingOnly = false }: { sequence: PlaybackSequence; sourceStatus: string; sourceText: string; paused: boolean; portalTarget: HTMLDivElement | null; profile: AvatarProfile; floatingOnly?: boolean }) {
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
  const firstMiss = sequence.missing?.[0];
  const remaining = current ? Math.max(0, sequence.items.length - (scheduled?.index ?? 0) - 1) : 0;
  const completion = totalDuration > 0 ? Math.min(100, (snapshot.elapsed / totalDuration) * 100) : 0;
  const [reducedMotion, setReducedMotion] = useState(false);
  const [rendererAttempt, setRendererAttempt] = useState(0);
  const [overlayState, setOverlayState] = useState<'closed' | 'minimized' | 'visible'>('visible');
  const { geometry, moveWithKeyboard, stageRef, startDrag } = useInterpreterGeometry();
  const playbackStatus = paused
    ? 'Paused'
    : snapshot.state === 'Error'
      ? 'Attention needed'
      : current
        ? snapshot.state
        : sourceText
          ? 'Interpreting'
          : 'Waiting';
  const statusTone = snapshot.state === 'Error'
    ? 'error'
    : playbackStatus === 'Playing'
      ? 'active'
      : playbackStatus === 'Interpreting'
        ? 'processing'
        : 'idle';

  useEffect(() => {
    if (paused && snapshot.state === 'Playing') controller.pause();
  }, [paused, snapshot.state]);

  useEffect(() => {
    console.info('[SignVerse] playback_sequence_received', {
      itemCount: sequence.items.length,
      unsupportedCount: sequence.unsupported_tokens.length,
      mappedAssets: sequence.items.filter((item) => Boolean(resolveAsset(item))).length,
    });
    sequence.missing?.forEach((miss) => {
      console.warn('[SignVerse] ISL asset lookup miss', {
        token: miss.token,
        normalizedToken: miss.normalized_token,
        reason: miss.reason,
        detail: miss.detail,
      });
    });
  }, [sequence]);

  useEffect(() => {
    if (!current) return;
    console.info('[SignVerse] playback_item_scheduled', {
      index: scheduled?.index ?? 0,
      tokenId: current.token_id,
      assetId: current.asset_id,
      assetResolved: Boolean(currentAsset),
      state: snapshot.state,
    });
  }, [current?.asset_id, scheduled?.index, snapshot.state]);

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
      if (snapshot.state === 'Playing') controller.pause();
      else controller.play();
    } else if (event.key === 'ArrowRight') controller.seek(snapshot.elapsed + 0.5);
    else if (event.key === 'ArrowLeft') controller.seek(snapshot.elapsed - 0.5);
    else if (event.key === 'Home') controller.restart();
  }

  const floatingInterpreter = portalTarget && createPortal(
    overlayState === 'closed' ? (
      <button
        aria-label="Show SignVerse interpreter"
        className="sv-restore-interpreter"
        onClick={() => setOverlayState('visible')}
        type="button"
      >
        <UIIcon name="accessibility" />
        Show interpreter
      </button>
    ) : (
      <div
        aria-label="Floating SignVerse interpreter"
        className={`sv-player-stage sv-interpreter-overlay ${
          overlayState === 'minimized' ? 'sv-interpreter-overlay--minimized' : ''
        }`}
        ref={stageRef}
        style={{ left: geometry.x, top: geometry.y, width: geometry.width, height: geometry.height }}
      >
        <header className="sv-interpreter-titlebar">
          <button
            aria-label="Move interpreter; use arrow keys or drag"
            className="sv-avatar-drag-handle"
            onKeyDown={moveWithKeyboard}
            onPointerDown={startDrag}
            type="button"
          >
            <span className="sv-interpreter-brand">SV</span>
            <span>
              <strong>SignVerse</strong>
              <small>ISL interpreter</small>
            </span>
          </button>
          <div
            aria-live="polite"
            className={`sv-interpreter-status sv-interpreter-status--${statusTone}`}
          >
            <span />
            {playbackStatus}
          </div>
          <div aria-label="Interpreter window controls" className="sv-floating-controls">
            <button
              aria-label={overlayState === 'minimized' ? 'Expand interpreter' : 'Minimize interpreter'}
              onClick={() => setOverlayState((currentState) => (
                currentState === 'minimized' ? 'visible' : 'minimized'
              ))}
              title={overlayState === 'minimized' ? 'Expand interpreter' : 'Minimize interpreter'}
              type="button"
            >
              <UIIcon name={overlayState === 'minimized' ? 'accessibility' : 'minimize'} />
            </button>
            <button
              aria-label="Close interpreter"
              onClick={() => setOverlayState('closed')}
              title="Close interpreter"
              type="button"
            >
              <UIIcon name="close" />
            </button>
          </div>
        </header>
        <FloatingCaption
          caption={sourceText}
          currentIndex={scheduled?.index ?? 0}
          emptyMessage={sourceStatus || 'Waiting for speech or captions…'}
          signCount={sequence.items.length}
        />
        {overlayState === 'visible' && (
          <>
            <div className="sv-interpreter-avatar-area">
              <AvatarRenderer
                asset={currentAsset}
                cue={current}
                cueIndex={scheduled?.index ?? -1}
                nextAsset={nextAsset}
                onError={controller.fail}
                playing={snapshot.state === 'Playing'}
                progress={scheduled?.localProgress ?? 0}
                profile={profile}
                reducedMotion={reducedMotion}
                retryKey={rendererAttempt}
                speed={snapshot.speed}
              />
            </div>
            <div className="sv-current-sign" aria-live="polite">
              <div>
                <span>Current sign</span>
                <strong>{current?.source_gloss ?? current?.token_id ?? 'Preparing interpretation'}</strong>
                <small>{currentAsset
                  ? `${currentAsset.display_name} · ISL sign`
                  : current ? 'Dataset asset unavailable' : firstMiss
                    ? `${firstMiss.token || '(blank)'} — ${firstMiss.detail}`
                    : 'Waiting for an ISL playback plan'}</small>
              </div>
              <span className="sv-sign-progress">
                {current ? `${(scheduled?.index ?? 0) + 1} of ${sequence.items.length}` : 'Ready'}
              </span>
            </div>
          </>
        )}
      </div>
    ),
    portalTarget,
  );

  if (floatingOnly) return floatingInterpreter;

  return (
    <div
      aria-label="ISL avatar playback controller"
      className="sv-player"
      onKeyDown={handleKeyboard}
      tabIndex={0}
    >
      {floatingInterpreter}

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

      <EnglishCaptionTrack
        caption={sourceText}
        currentIndex={scheduled?.index ?? 0}
        emptyMessage={sourceStatus || 'English source text is unavailable.'}
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
        {(sequence.missing?.length ?? 0) > 0
          ? <ul>{sequence.missing?.map((miss, index) => (
            <li key={`${miss.token}-${miss.reason}-${index}`}>
              <strong>{miss.token || '(blank gloss)'}</strong>: {miss.detail}
            </li>
          ))}</ul>
          : unsupported.length > 0
            ? <ul>{unsupported.map((token) => <li key={token}>{token}: dataset asset unavailable</li>)}</ul>
          : <p>None detected</p>}
      </div>
      <p className="sv-player-shortcuts">Keyboard: Space play/pause · ←/→ seek · Home restart</p>
    </div>
  );
}

export function SignPlaybackPanel({ state, paused = false, portalTarget = null, sourceStatus = '', sourceText = '', profile = DEFAULT_AVATAR }: { state: InterpretationState; paused?: boolean; portalTarget?: HTMLDivElement | null; sourceStatus?: string; sourceText?: string; profile?: AvatarProfile }) {
  const [fallbackPortalTarget, setFallbackPortalTarget] = useState<HTMLDivElement | null>(null);
  if (state.status === 'loading') {
    return (
      <>
        <section aria-busy="true" aria-live="polite" className="sv-card sv-player-skeleton">
          <span className="sv-visually-hidden">Preparing ISL playback</span>
          <div className="sv-skeleton-player" />
          <div className="sv-skeleton-controls" />
        </section>
        <PlaybackController
          floatingOnly
          paused={paused}
          portalTarget={portalTarget}
          profile={profile}
          sequence={EMPTY_SEQUENCE}
          sourceStatus={sourceStatus}
          sourceText={sourceText}
        />
      </>
    );
  }

  const sequence = state.status === 'ready' ? state.response.playback ?? EMPTY_SEQUENCE : EMPTY_SEQUENCE;
  const glossCount = state.status === 'ready' ? state.response.isl_gloss.length : 0;

  return (
    <>
      <CollapsibleCard badge={`${sequence.items.length || glossCount} signs`} defaultExpanded icon="translate" title="ISL Playback">
        <PlaybackController sourceStatus={sourceStatus} sourceText={sourceText} paused={paused} portalTarget={portalTarget ?? fallbackPortalTarget} profile={profile} sequence={sequence} />
      </CollapsibleCard>
      {!portalTarget && <div ref={setFallbackPortalTarget} />}
    </>
  );
}
