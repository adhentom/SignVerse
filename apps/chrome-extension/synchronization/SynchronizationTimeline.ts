import type {
  InterpretationResponse,
  PlaybackItem,
  PlaybackSequence,
} from '../shared/interpretation';
import type { ContentPacket } from '../shared/contentPacket';

export type MediaPlaybackState =
  | 'advertisement'
  | 'paused'
  | 'playing'
  | 'seeking';

export interface MediaClockSample {
  positionMs: number;
  rate: number;
  sourceId: string;
  state: MediaPlaybackState;
}

export interface SynchronizationDiagnostics {
  bufferDepth: number;
  correctionCount: number;
  driftMs: number;
  hardCorrectionCount: number;
  lateItemCount: number;
  mediaPositionMs: number;
  playbackRate: number;
  scheduledIndex: number;
  state: MediaPlaybackState | 'unavailable';
}

export interface SynchronizedPosition {
  elapsedSeconds: number;
  index: number;
  localProgress: number;
  mediaPositionMs: number;
}

interface ScheduledItem {
  endMs: number;
  index: number;
  startMs: number;
  syntheticEndSeconds: number;
  syntheticStartSeconds: number;
}

const DEFAULT_BUFFER_MS = 250;
const DRIFT_CORRECTION_THRESHOLD_MS = 120;
const HARD_CORRECTION_THRESHOLD_MS = 1_000;

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function clampPlaybackRate(rate: number): number {
  if (!Number.isFinite(rate)) return 1;
  return Math.min(2, Math.max(0.25, rate));
}

function packetTiming(packet: ContentPacket): {
  endMs?: number;
  startMs?: number;
  cueId: string;
} {
  const metadata = packet.metadata as Record<string, unknown>;
  const playbackTimeMs = finiteNumber(metadata.playbackTimeMs);
  const captionStartMs = finiteNumber(metadata.captionStartMs);
  const captionEndMs = finiteNumber(metadata.captionEndMs);
  return {
    startMs: captionStartMs ?? playbackTimeMs,
    endMs: captionEndMs,
    cueId: typeof metadata.cueId === 'string'
      ? metadata.cueId
      : `${packet.platform}:${packet.timestamp}:${packet.text}`,
  };
}

export function partitionTimedPacket(
  packet: ContentPacket,
  texts: readonly string[],
): ContentPacket[] {
  const metadata = packet.metadata as Record<string, unknown>;
  const startMs = finiteNumber(metadata.captionStartMs);
  const endMs = finiteNumber(metadata.captionEndMs);
  const weights = texts.map((text) => Math.max(1, text.trim().length));
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  let elapsedWeight = 0;
  return texts.map((text, index) => {
    if (startMs === undefined || endMs === undefined || endMs <= startMs) {
      return { ...packet, text };
    }
    const segmentStartMs = startMs + ((elapsedWeight / totalWeight) * (endMs - startMs));
    elapsedWeight += weights[index] ?? 1;
    const segmentEndMs = startMs + ((elapsedWeight / totalWeight) * (endMs - startMs));
    return {
      ...packet,
      text,
      metadata: {
        ...metadata,
        captionStartMs: segmentStartMs,
        captionEndMs: segmentEndMs,
      },
    };
  });
}

/**
 * Adds browser-local source timing to a validated interpretation response.
 * The backend contract is unchanged; annotations exist only inside the extension.
 */
export function attachPlaybackSynchronization(
  response: InterpretationResponse,
  packet: ContentPacket,
  requestSequence: number,
): InterpretationResponse {
  const playback = response.playback;
  if (!playback?.items.length) return response;
  const timing = packetTiming(packet);
  if (timing.startMs === undefined) return response;

  const durations = playback.items.map((item) => (
    Number.isFinite(item.duration) && item.duration > 0 ? item.duration : 1
  ));
  const totalDuration = durations.reduce((total, duration) => total + duration, 0);
  const naturalEndMs = timing.startMs + totalDuration * 1_000;
  const endMs = timing.endMs !== undefined && timing.endMs > timing.startMs
    ? timing.endMs
    : naturalEndMs;
  const sourceDurationMs = Math.max(100, endMs - timing.startMs);
  let elapsedWeight = 0;
  const items = playback.items.map((item, index): PlaybackItem => {
    const itemStartMs = timing.startMs! + (elapsedWeight / totalDuration) * sourceDurationMs;
    elapsedWeight += durations[index] ?? 1;
    const itemEndMs = timing.startMs! + (elapsedWeight / totalDuration) * sourceDurationMs;
    return {
      ...item,
      synchronization: {
        caption_end_ms: itemEndMs,
        caption_start_ms: itemStartMs,
        cue_id: timing.cueId,
        request_sequence: requestSequence,
        source_text: packet.text,
      },
    };
  });
  return { ...response, playback: { ...playback, items } };
}

function compileSchedule(sequence: PlaybackSequence): ScheduledItem[] {
  let elapsedSeconds = 0;
  return sequence.items.flatMap((item, index): ScheduledItem[] => {
    const syntheticStartSeconds = elapsedSeconds;
    elapsedSeconds += item.duration;
    const synchronization = item.synchronization;
    if (!synchronization) return [];
    return [{
      startMs: synchronization.caption_start_ms,
      endMs: Math.max(
        synchronization.caption_start_ms + 1,
        synchronization.caption_end_ms,
      ),
      index,
      syntheticStartSeconds,
      syntheticEndSeconds: elapsedSeconds,
    }];
  }).sort((left, right) => left.startMs - right.startMs || left.index - right.index);
}

export class SynchronizationTimeline {
  private anchorPositionMs = 0;
  private anchorWallTimeMs = 0;
  private correctionCount = 0;
  private driftMs = 0;
  private hardCorrectionCount = 0;
  private lateItemCount = 0;
  private rate = 1;
  private schedule: ScheduledItem[] = [];
  private sourceId = '';
  private sourceState: MediaPlaybackState | 'unavailable' = 'unavailable';

  constructor(
    sequence: PlaybackSequence,
    private readonly bufferMs = DEFAULT_BUFFER_MS,
  ) {
    this.setSequence(sequence);
  }

  setSequence(sequence: PlaybackSequence): void {
    this.schedule = compileSchedule(sequence);
  }

  hasTimestampedItems(): boolean {
    return this.schedule.length > 0;
  }

  updateSource(sample: MediaClockSample, wallTimeMs: number): void {
    const positionMs = Math.max(0, sample.positionMs);
    const rate = clampPlaybackRate(sample.rate);
    const sourceChanged = this.sourceId !== sample.sourceId;
    const predicted = this.estimatedPosition(wallTimeMs);
    const drift = this.sourceState === 'unavailable' ? 0 : positionMs - predicted;
    this.driftMs = drift;
    const hardCorrection = sample.state === 'seeking' ||
      sourceChanged ||
      this.sourceState === 'unavailable' ||
      Math.abs(drift) >= HARD_CORRECTION_THRESHOLD_MS;
    if (hardCorrection) {
      if (this.sourceState !== 'unavailable') this.hardCorrectionCount += 1;
      this.anchorPositionMs = positionMs;
    } else if (Math.abs(drift) >= DRIFT_CORRECTION_THRESHOLD_MS) {
      this.correctionCount += 1;
      this.anchorPositionMs = predicted + drift * 0.5;
    } else {
      this.anchorPositionMs = positionMs;
    }
    this.anchorWallTimeMs = wallTimeMs;
    this.rate = rate;
    this.sourceId = sample.sourceId;
    this.sourceState = sample.state;
  }

  estimatedPosition(wallTimeMs: number): number {
    if (this.sourceState !== 'playing') return this.anchorPositionMs;
    return Math.max(
      0,
      this.anchorPositionMs + Math.max(0, wallTimeMs - this.anchorWallTimeMs) * this.rate,
    );
  }

  locate(wallTimeMs: number): SynchronizedPosition | undefined {
    if (!this.hasTimestampedItems()) return undefined;
    const mediaPositionMs = this.estimatedPosition(wallTimeMs);
    const active = this.schedule.filter(
      (item) => mediaPositionMs >= item.startMs && mediaPositionMs < item.endMs,
    ).at(-1);
    const next = active ?? this.schedule.find(
      (item) => item.startMs > mediaPositionMs &&
        item.startMs - mediaPositionMs <= this.bufferMs,
    );
    if (!next) {
      const completed = [...this.schedule].reverse().find((item) => item.endMs <= mediaPositionMs);
      if (completed && mediaPositionMs - completed.endMs <= this.bufferMs) {
        return {
          elapsedSeconds: completed.syntheticEndSeconds - Number.EPSILON,
          index: completed.index,
          localProgress: 1,
          mediaPositionMs,
        };
      }
      if (this.schedule.at(-1) && mediaPositionMs > this.schedule.at(-1)!.endMs) {
        this.lateItemCount = this.schedule.filter((item) => item.endMs < mediaPositionMs).length;
      }
      return undefined;
    }
    this.lateItemCount = 0;
    const sourceDurationMs = Math.max(1, next.endMs - next.startMs);
    const localProgress = active
      ? Math.min(1, Math.max(0, (mediaPositionMs - next.startMs) / sourceDurationMs))
      : 0;
    const syntheticDuration = next.syntheticEndSeconds - next.syntheticStartSeconds;
    return {
      elapsedSeconds: next.syntheticStartSeconds + syntheticDuration * localProgress,
      index: next.index,
      localProgress,
      mediaPositionMs,
    };
  }

  diagnostics(wallTimeMs: number): SynchronizationDiagnostics {
    const located = this.locate(wallTimeMs);
    const mediaPositionMs = this.estimatedPosition(wallTimeMs);
    return {
      bufferDepth: this.schedule.filter((item) => item.endMs >= mediaPositionMs).length,
      correctionCount: this.correctionCount,
      driftMs: this.driftMs,
      hardCorrectionCount: this.hardCorrectionCount,
      lateItemCount: this.lateItemCount,
      mediaPositionMs,
      playbackRate: this.rate,
      scheduledIndex: located?.index ?? -1,
      state: this.sourceState,
    };
  }
}
