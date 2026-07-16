import type { PlaybackSequence } from '../shared/interpretation';

export function appendPlayback(
  current: PlaybackSequence,
  next: PlaybackSequence,
): PlaybackSequence {
  return {
    items: [...current.items, ...next.items].slice(-200),
    unsupported_tokens: [...new Set([...current.unsupported_tokens, ...next.unsupported_tokens])],
  };
}

export function removeCompleted(sequence: PlaybackSequence, count: number): PlaybackSequence {
  return { ...sequence, items: sequence.items.slice(Math.max(0, count)) };
}
