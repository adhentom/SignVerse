import type { LiveContentSnapshot } from '../shared/liveContent';
import type { MediaClockSample, MediaPlaybackState } from './SynchronizationTimeline';

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function mediaClockFromSnapshot(
  snapshot: LiveContentSnapshot | null,
): MediaClockSample | null {
  if (!snapshot) return null;
  const metadata = snapshot.metadata as Record<string, unknown>;
  const positionMs = finiteNumber(metadata.playbackTimeMs);
  if (positionMs === undefined) return null;
  const rawState = String(metadata.playbackState ?? snapshot.status);
  const state: MediaPlaybackState = snapshot.status === 'advertisement'
    ? 'advertisement'
    : rawState === 'seeking'
      ? 'seeking'
      : rawState === 'paused' || snapshot.status === 'paused'
        ? 'paused'
        : 'playing';
  return {
    positionMs,
    rate: finiteNumber(metadata.playbackRate) ?? 1,
    sourceId: String(metadata.videoId ?? metadata.meetingId ?? snapshot.title),
    state,
  };
}
