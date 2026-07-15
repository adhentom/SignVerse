import { useEffect, useMemo, useState } from 'react';
import type { InterpretationState, PlaybackSequence } from '../../shared/interpretation';
import { CollapsibleCard } from './CollapsibleCard';
import { UIIcon } from './UIIcon';

const EMPTY_SEQUENCE: PlaybackSequence = { items: [], unsupported_tokens: [] };

function getIndexAtTime(sequence: PlaybackSequence, elapsed: number): number {
  let boundary = 0;
  for (let index = 0; index < sequence.items.length; index += 1) {
    boundary += sequence.items[index].duration;
    if (elapsed < boundary) return index;
  }
  return Math.max(0, sequence.items.length - 1);
}

function PlaybackController({ sequence }: { sequence: PlaybackSequence }) {
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const sequenceKey = sequence.items.map((item) => `${item.asset_id}:${item.duration}`).join('|');
  const totalDuration = useMemo(
    () => sequence.items.reduce((total, item) => total + item.duration, 0),
    [sequenceKey],
  );
  const currentIndex = getIndexAtTime(sequence, elapsed);
  const current = sequence.items[currentIndex];
  const remaining = current ? Math.max(0, sequence.items.length - currentIndex - 1) : 0;
  const progress = totalDuration > 0 ? Math.min(100, (elapsed / totalDuration) * 100) : 0;

  useEffect(() => {
    setElapsed(0);
    setPlaying(false);
  }, [sequenceKey]);

  useEffect(() => {
    if (!playing || totalDuration === 0) return;
    const timer = window.setInterval(() => {
      setElapsed((currentElapsed) => {
        return Math.min(totalDuration, currentElapsed + 0.1);
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, [playing, totalDuration]);

  useEffect(() => {
    if (playing && elapsed >= totalDuration) setPlaying(false);
  }, [elapsed, playing, totalDuration]);

  function play() {
    if (elapsed >= totalDuration) setElapsed(0);
    setPlaying(sequence.items.length > 0);
  }

  function next() {
    if (!current || currentIndex >= sequence.items.length - 1) {
      setElapsed(totalDuration);
      setPlaying(false);
      return;
    }
    const nextStart = sequence.items
      .slice(0, currentIndex + 1)
      .reduce((total, item) => total + item.duration, 0);
    setElapsed(nextStart);
  }

  return (
    <div className="sv-player">
      <p className="sv-player-disclosure">
        Playback plan preview · placeholder assets only
      </p>
      <div className="sv-player-stage" aria-live="polite">
        <div className="sv-sign-visual" aria-hidden="true">
          <span><UIIcon name="accessibility" /></span>
          <i className={playing ? 'sv-sign-pulse sv-sign-pulse--active' : 'sv-sign-pulse'} />
        </div>
        <div className="sv-current-sign">
          <span>Current sign</span>
          <strong>{current?.token_id ?? 'No sign scheduled'}</strong>
          <small>{current ? `${current.asset_id} · ${Math.round(current.confidence * 100)}% confidence` : 'Waiting for a supported token'}</small>
        </div>
      </div>

      <div className="sv-player-controls" aria-label="Playback controls">
        <button aria-label="Play sign sequence" disabled={!current || playing} onClick={play} type="button">
          <UIIcon name="play" />
        </button>
        <button aria-label="Pause sign sequence" disabled={!playing} onClick={() => setPlaying(false)} type="button">
          <UIIcon name="pause" />
        </button>
        <button
          aria-label="Next sign"
          disabled={!current || currentIndex >= sequence.items.length - 1}
          onClick={next}
          type="button"
        >
          <UIIcon name="next" />
        </button>
        <div className="sv-player-count">
          <strong>{current ? `${currentIndex + 1}/${sequence.items.length}` : '0/0'}</strong>
          <span>{remaining} remaining</span>
        </div>
      </div>

      <div className="sv-player-timeline">
        <div>
          <span>{elapsed.toFixed(1)}s</span>
          <span>{totalDuration.toFixed(1)}s</span>
        </div>
        <input
          aria-label="Playback timeline"
          disabled={totalDuration === 0}
          max={totalDuration || 1}
          min="0"
          onChange={(event) => setElapsed(Number(event.currentTarget.value))}
          step="0.1"
          type="range"
          value={elapsed}
        />
        <progress aria-label={`${Math.round(progress)} percent played`} max="100" value={progress} />
      </div>

      <div className="sv-token-queue">
        <span>Playback order</span>
        {sequence.items.length > 0 ? (
          <ol>
            {sequence.items.map((item, index) => (
              <li
                aria-current={index === currentIndex ? 'step' : undefined}
                className={index === currentIndex ? 'sv-token--current' : ''}
                key={`${item.asset_id}-${index}`}
              >
                <span>{index + 1}</span>{item.token_id}
              </li>
            ))}
          </ol>
        ) : <p>No supported signs are available in this plan.</p>}
      </div>

      <div className="sv-unsupported">
        <span>Unsupported concepts</span>
        {sequence.unsupported_tokens.length > 0 ? (
          <ul>{sequence.unsupported_tokens.map((token) => <li key={token}>{token}</li>)}</ul>
        ) : <p>None detected</p>}
      </div>
    </div>
  );
}

export function SignPlaybackPanel({ state }: { state: InterpretationState }) {
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

  return (
    <CollapsibleCard
      badge={`${sequence.items.length || glossCount} signs`}
      defaultExpanded
      icon="translate"
      title="ISL Playback"
    >
      <PlaybackController sequence={sequence} />
    </CollapsibleCard>
  );
}
