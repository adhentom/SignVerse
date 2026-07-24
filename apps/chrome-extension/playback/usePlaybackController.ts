import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PlaybackSequence } from '../shared/interpretation';
import { AnimationScheduler } from './AnimationScheduler';
import { transitionRendererState } from './stateMachine';
import type { PlaybackSnapshot } from './types';
import {
  clampPlaybackRate,
  SynchronizationTimeline,
  type MediaClockSample,
  type SynchronizationDiagnostics,
} from '../synchronization/SynchronizationTimeline';

const EMPTY_DIAGNOSTICS: SynchronizationDiagnostics = {
  bufferDepth: 0,
  correctionCount: 0,
  driftMs: 0,
  hardCorrectionCount: 0,
  lateItemCount: 0,
  mediaPositionMs: 0,
  playbackRate: 1,
  scheduledIndex: -1,
  state: 'unavailable',
};

export function usePlaybackController(
  sequence: PlaybackSequence,
  mediaClock: MediaClockSample | null = null,
) {
  const sequenceKey = sequence.items.map((item) => (
    `${item.token_id}:${item.asset_id}:${item.duration}:` +
    `${item.synchronization?.caption_start_ms ?? ''}:` +
    `${item.synchronization?.caption_end_ms ?? ''}`
  )).join('|');
  const scheduler = useMemo(() => new AnimationScheduler(sequence), [sequenceKey]);
  const synchronization = useRef(new SynchronizationTimeline(sequence));
  const manualPause = useRef(false);
  const [snapshot, setSnapshot] = useState<PlaybackSnapshot>({
    state: 'Idle', elapsed: 0, currentIndex: 0, speed: 1,
  });
  const [syncDiagnostics, setSyncDiagnostics] =
    useState<SynchronizationDiagnostics>(EMPTY_DIAGNOSTICS);
  const previousItems = useRef<PlaybackSequence['items']>([]);

  const update = useCallback((changes: Partial<PlaybackSnapshot>) => {
    setSnapshot((current) => {
      const nextState = changes.state
        ? transitionRendererState(current.state, changes.state)
        : current.state;
      const elapsed = changes.elapsed ?? current.elapsed;
      return {
        ...current,
        ...changes,
        state: nextState,
        elapsed,
        currentIndex: scheduler.locate(elapsed)?.index ?? 0,
      };
    });
  }, [scheduler]);

  useEffect(() => {
    synchronization.current.setSequence(sequence);
    const previous = previousItems.current;
    const appended = previous.length > 0 && previous.every((item, index) => (
      item.token_id === sequence.items[index]?.token_id &&
      item.asset_id === sequence.items[index]?.asset_id
    ));
    previousItems.current = sequence.items;
    const synchronized = Boolean(mediaClock) && synchronization.current.hasTimestampedItems();
    setSnapshot((current) => {
      if (synchronized) {
        return {
          ...current,
          state: sequence.items.length > 0 ? 'Loading' : 'Idle',
        };
      }
      return appended
        ? { ...current, state: current.state === 'Finished' ? 'Playing' : current.state }
        : {
            state: sequence.items.length > 0 ? 'Playing' : 'Idle',
            elapsed: 0,
            currentIndex: 0,
            speed: current.speed,
          };
    });
  }, [sequenceKey]);

  useEffect(() => {
    if (!mediaClock) return;
    synchronization.current.updateSource(mediaClock, performance.now());
  }, [mediaClock ? JSON.stringify(mediaClock) : '']);

  const synchronized = Boolean(mediaClock) && synchronization.current.hasTimestampedItems();

  useEffect(() => {
    if (!synchronized || !mediaClock) {
      setSyncDiagnostics(EMPTY_DIAGNOSTICS);
      return;
    }
    const updateFromMediaClock = () => {
      const now = performance.now();
      const located = synchronization.current.locate(now);
      const diagnostics = synchronization.current.diagnostics(now);
      setSyncDiagnostics(diagnostics);
      setSnapshot((current) => {
        const paused = manualPause.current ||
          diagnostics.state === 'paused' ||
          diagnostics.state === 'advertisement' ||
          diagnostics.state === 'seeking';
        const state = paused
          ? 'Paused'
          : located
            ? 'Playing'
            : diagnostics.bufferDepth === 0 && diagnostics.lateItemCount > 0
              ? 'Finished'
              : 'Loading';
        return {
          ...current,
          state,
          elapsed: located?.elapsedSeconds ?? current.elapsed,
          currentIndex: located?.index ?? current.currentIndex,
          speed: diagnostics.playbackRate,
        };
      });
    };
    updateFromMediaClock();
    const timer = window.setInterval(updateFromMediaClock, 50);
    return () => window.clearInterval(timer);
  }, [mediaClock?.sourceId, mediaClock?.state, synchronized]);

  useEffect(() => {
    if (synchronized || snapshot.state !== 'Playing') return;
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const timestamp = performance.now();
      const delta = timestamp - previous;
      previous = timestamp;
      setSnapshot((current) => {
        const elapsed = Math.min(
          scheduler.totalDuration,
          current.elapsed + (delta / 1_000) * current.speed,
        );
        const finished = elapsed >= scheduler.totalDuration;
        return {
          ...current,
          elapsed,
          currentIndex: scheduler.locate(elapsed)?.index ?? 0,
          state: finished ? 'Finished' : current.state,
        };
      });
    }, 50);
    return () => window.clearInterval(timer);
  }, [scheduler, snapshot.state, synchronized]);

  const play = useCallback(() => {
    if (sequence.items.length === 0) return;
    manualPause.current = false;
    update({
      elapsed: snapshot.state === 'Finished' ? 0 : snapshot.elapsed,
      state: 'Playing',
      error: undefined,
    });
  }, [sequence.items.length, snapshot.elapsed, snapshot.state, update]);
  const pause = useCallback(() => {
    manualPause.current = true;
    update({ state: 'Paused' });
  }, [update]);
  const restart = useCallback(() => {
    manualPause.current = false;
    update({ elapsed: 0, state: 'Playing' });
  }, [update]);
  const seek = useCallback((elapsed: number) => update({
    elapsed: Math.min(Math.max(0, elapsed), scheduler.totalDuration),
    state: elapsed >= scheduler.totalDuration
      ? 'Finished'
      : snapshot.state === 'Finished' ? 'Paused' : snapshot.state,
  }), [scheduler.totalDuration, snapshot.state, update]);
  const move = useCallback((offset: number) => {
    const index = Math.min(
      Math.max(0, snapshot.currentIndex + offset),
      Math.max(0, sequence.items.length - 1),
    );
    update({ elapsed: scheduler.startOf(index), state: 'Paused' });
  }, [scheduler, sequence.items.length, snapshot.currentIndex, update]);
  const setSpeed = useCallback((speed: number) => {
    if (!synchronized) update({ speed: clampPlaybackRate(speed) });
  }, [synchronized, update]);
  const fail = useCallback((message: string) => update({ state: 'Error', error: message }), [update]);

  return {
    snapshot,
    synchronization: syncDiagnostics,
    synchronized,
    scheduled: scheduler.locate(snapshot.elapsed),
    totalDuration: scheduler.totalDuration,
    play,
    pause,
    restart,
    previous: () => move(-1),
    next: () => move(1),
    seek,
    setSpeed,
    fail,
  };
}
