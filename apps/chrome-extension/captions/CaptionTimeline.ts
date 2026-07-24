export interface TimedCaptionSegment {
  endSeconds: number;
  index: number;
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
