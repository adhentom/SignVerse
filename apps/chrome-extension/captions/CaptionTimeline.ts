import type { PlaybackItem } from '../shared/interpretation';

export interface TimedCaptionSegment {
  endSeconds: number;
  index: number;
  startSeconds: number;
  text: string;
}

export interface BufferedCaptionSegment {
  endIndex: number;
  endSeconds: number;
  key: string;
  startIndex: number;
  startSeconds: number;
  text: string;
}

function normalizedDurations(durations: readonly number[]): number[] {
  return durations.map((duration) => (
    Number.isFinite(duration) && duration > 0 ? duration : 1
  ));
}

/**
 * Maps source-caption words onto the exact avatar playback timeline.
 *
 * Segment boundaries are weighted by sign duration, so the caption displayed
 * for a long sign remains visible longer than one associated with a short sign.
 */
export function buildCaptionTimeline(
  caption: string,
  signDurations: readonly number[],
): TimedCaptionSegment[] {
  const words = caption.replace(/\s+/gu, ' ').trim().split(' ').filter(Boolean);
  if (words.length === 0 || signDurations.length === 0) return [];

  const durations = normalizedDurations(signDurations);
  const totalDuration = durations.reduce((total, duration) => total + duration, 0);
  let elapsed = 0;

  return durations.map((duration, index) => {
    const startSeconds = elapsed;
    elapsed += duration;
    const startWord = Math.min(
      words.length - 1,
      Math.floor((startSeconds / totalDuration) * words.length),
    );
    const endWord = index === durations.length - 1
      ? words.length
      : Math.max(
          startWord + 1,
          Math.floor((elapsed / totalDuration) * words.length),
        );
    return {
      endSeconds: elapsed,
      index,
      startSeconds,
      text: words.slice(startWord, Math.min(words.length, endWord)).join(' '),
    };
  });
}

/** Returns the caption segment active at the same elapsed time as the avatar. */
export function captionAtTime(
  timeline: readonly TimedCaptionSegment[],
  elapsedSeconds: number,
): TimedCaptionSegment | undefined {
  if (timeline.length === 0) return undefined;
  const elapsed = Math.max(0, elapsedSeconds);
  return timeline.find((segment) => elapsed < segment.endSeconds) ?? timeline.at(-1);
}

/**
 * Buffers caption text carried by timestamped playback items. Repeated items
 * from one interpretation response collapse into one stable caption cue.
 */
export function buildSynchronizedCaptionBuffer(
  items: readonly PlaybackItem[],
): BufferedCaptionSegment[] {
  const cues = new Map<string, BufferedCaptionSegment>();
  items.forEach((item, index) => {
    const timing = item.synchronization;
    if (!timing) return;
    const key = `${timing.request_sequence}:${timing.cue_id}`;
    const current = cues.get(key);
    if (current) {
      current.endIndex = index;
      current.endSeconds = Math.max(current.endSeconds, timing.caption_end_ms / 1_000);
      return;
    }
    cues.set(key, {
      endIndex: index,
      endSeconds: timing.caption_end_ms / 1_000,
      key,
      startIndex: index,
      startSeconds: timing.caption_start_ms / 1_000,
      text: timing.source_text,
    });
  });
  return [...cues.values()].sort(
    (left, right) => left.startSeconds - right.startSeconds ||
      left.startIndex - right.startIndex,
  );
}

export function bufferedCaptionAtIndex(
  buffer: readonly BufferedCaptionSegment[],
  index: number,
): BufferedCaptionSegment | undefined {
  return buffer.find((cue) => index >= cue.startIndex && index <= cue.endIndex);
}
