import type { PlaybackSequence } from '../shared/interpretation';

export const MAX_QUEUED_SIGNS = 1_000;

export function appendPlayback(
  current: PlaybackSequence,
  next: PlaybackSequence,
): PlaybackSequence {
  const incoming = next.items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => (right.item.priority ?? 0) - (left.item.priority ?? 0) || left.index - right.index)
    .map(({ item }) => item);
  console.info('[SignVerse] playback_queue_append', { count: incoming.length });
  return {
    // Keep the active prefix stable while streaming. Dropping the head makes
    // the controller treat an append as a replacement and restarts playback.
    items: [...current.items, ...incoming].slice(0, MAX_QUEUED_SIGNS),
    unsupported_tokens: [...new Set([...current.unsupported_tokens, ...next.unsupported_tokens])],
    missing: [...(current.missing ?? []), ...(next.missing ?? [])].filter(
      (miss, index, all) => all.findIndex((candidate) =>
        candidate.token === miss.token && candidate.reason === miss.reason
      ) === index,
    ),
  };
}

export function removeCompleted(sequence: PlaybackSequence, count: number): PlaybackSequence {
  console.info('[SignVerse] playback_queue_remove', { count });
  return { ...sequence, items: sequence.items.slice(Math.max(0, count)) };
}

export function cancelPlayback(): PlaybackSequence {
  console.info('[SignVerse] playback_queue_cancel');
  return { items: [], unsupported_tokens: [], missing: [] };
}
