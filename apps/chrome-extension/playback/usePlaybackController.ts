import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PlaybackSequence } from '../shared/interpretation';
import { AnimationScheduler } from './AnimationScheduler';
import { transitionRendererState } from './stateMachine';
import type { PlaybackSnapshot, RendererState } from './types';

export function usePlaybackController(sequence: PlaybackSequence) {
  const sequenceKey = sequence.items.map((item) => `${item.asset_id}:${item.duration}`).join('|');
  const scheduler = useMemo(() => new AnimationScheduler(sequence), [sequenceKey]);
  const [snapshot, setSnapshot] = useState<PlaybackSnapshot>({
    state: 'Idle', elapsed: 0, currentIndex: 0, speed: 1,
  });

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
    setSnapshot({ state: 'Idle', elapsed: 0, currentIndex: 0, speed: 1 });
  }, [sequenceKey]);

  useEffect(() => {
    if (snapshot.state !== 'Playing') return;
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
  }, [scheduler, snapshot.state]);

  const play = useCallback(() => {
    if (sequence.items.length === 0) return;
    update({
      elapsed: snapshot.state === 'Finished' ? 0 : snapshot.elapsed,
      state: 'Playing',
      error: undefined,
    });
  }, [sequence.items.length, snapshot.elapsed, snapshot.state, update]);
  const pause = useCallback(() => update({ state: 'Paused' }), [update]);
  const restart = useCallback(() => update({ elapsed: 0, state: 'Playing' }), [update]);
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
  const setSpeed = useCallback((speed: number) => update({ speed }), [update]);
  const fail = useCallback((message: string) => update({ state: 'Error', error: message }), [update]);

  return {
    snapshot,
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
