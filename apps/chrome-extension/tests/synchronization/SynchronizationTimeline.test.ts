import { describe, expect, it } from 'vitest';
import {
  attachPlaybackSynchronization,
  clampPlaybackRate,
  partitionTimedPacket,
  SynchronizationTimeline,
  type MediaClockSample,
} from '../../synchronization/SynchronizationTimeline';
import type { InterpretationResponse, PlaybackSequence } from '../../shared/interpretation';

function response(): InterpretationResponse {
  return {
    summary: '',
    malayalam_translation: '',
    key_points: [],
    keywords: [],
    glossary: [],
    isl_gloss: ['ONE', 'TWO'],
    confidence: 0.9,
    playback: {
      items: [
        { token_id: 'ONE', asset_id: 'one', duration: 1, confidence: 0.9 },
        { token_id: 'TWO', asset_id: 'two', duration: 3, confidence: 0.9 },
      ],
      unsupported_tokens: [],
    },
  };
}

function timedSequence(): PlaybackSequence {
  return attachPlaybackSynchronization(
    response(),
    {
      platform: 'youtube',
      title: 'Video',
      timestamp: '00:10',
      text: 'First synchronized caption',
      metadata: {
        captionStartMs: 10_000,
        captionEndMs: 14_000,
        cueId: 'cue-1',
        playbackTimeMs: 10_500,
      },
    },
    7,
  ).playback!;
}

function sample(
  positionMs: number,
  state: MediaClockSample['state'] = 'playing',
  rate = 1,
): MediaClockSample {
  return { positionMs, rate, sourceId: 'video-1', state };
}

describe('SynchronizationTimeline', () => {
  it('distributes avatar items over exact source-caption timestamps', () => {
    const sequence = timedSequence();
    expect(sequence.items[0]?.synchronization).toMatchObject({
      caption_start_ms: 10_000,
      caption_end_ms: 11_000,
      request_sequence: 7,
      source_text: 'First synchronized caption',
    });
    expect(sequence.items[1]?.synchronization).toMatchObject({
      caption_start_ms: 11_000,
      caption_end_ms: 14_000,
    });

    const timeline = new SynchronizationTimeline(sequence);
    timeline.updateSource(sample(12_500), 1_000);
    expect(timeline.locate(1_000)).toMatchObject({
      index: 1,
      localProgress: 0.5,
      elapsedSeconds: 2.5,
    });
  });

  it('partitions multi-sentence caption packets into non-overlapping timestamp windows', () => {
    const packets = partitionTimedPacket({
      platform: 'youtube',
      title: 'Video',
      timestamp: '00:10',
      text: 'Short. This sentence is longer.',
      metadata: {
        captionStartMs: 10_000,
        captionEndMs: 14_000,
        cueId: 'cue',
      },
    }, ['Short.', 'This sentence is longer.']);

    const firstEnd = Number(packets[0]?.metadata.captionEndMs);
    const secondStart = Number(packets[1]?.metadata.captionStartMs);
    expect(packets).toHaveLength(2);
    expect(firstEnd).toBe(secondStart);
    expect(Number(packets[0]?.metadata.captionStartMs)).toBe(10_000);
    expect(Number(packets[1]?.metadata.captionEndMs)).toBe(14_000);
  });

  it('tracks playback speed between 0.25x and 2x', () => {
    expect(clampPlaybackRate(0.1)).toBe(0.25);
    expect(clampPlaybackRate(4)).toBe(2);

    const timeline = new SynchronizationTimeline(timedSequence());
    timeline.updateSource(sample(10_000, 'playing', 2), 1_000);
    expect(timeline.locate(1_500)?.index).toBe(1);
    expect(timeline.diagnostics(1_500).mediaPositionMs).toBe(11_000);
  });

  it('holds the media clock during pause and advertisements, then resumes', () => {
    const timeline = new SynchronizationTimeline(timedSequence());
    timeline.updateSource(sample(10_500, 'paused'), 1_000);
    expect(timeline.diagnostics(4_000).mediaPositionMs).toBe(10_500);

    timeline.updateSource(sample(10_600, 'advertisement'), 4_000);
    expect(timeline.diagnostics(8_000).mediaPositionMs).toBe(10_600);

    timeline.updateSource(sample(10_600, 'playing'), 8_000);
    expect(timeline.diagnostics(8_500).mediaPositionMs).toBe(11_100);
  });

  it('detects drift, performs smooth correction, and hard-resets after seek', () => {
    const timeline = new SynchronizationTimeline(timedSequence());
    timeline.updateSource(sample(10_000), 1_000);
    timeline.updateSource(sample(10_700), 1_500);
    expect(timeline.diagnostics(1_500)).toMatchObject({
      correctionCount: 1,
      driftMs: 200,
    });

    timeline.updateSource(sample(13_000, 'seeking'), 1_600);
    expect(timeline.diagnostics(1_600)).toMatchObject({
      hardCorrectionCount: 1,
      mediaPositionMs: 13_000,
      scheduledIndex: 1,
      state: 'seeking',
    });
  });

  it('prebuffers the next sign and reports late items without fabricating playback', () => {
    const timeline = new SynchronizationTimeline(timedSequence(), 250);
    timeline.updateSource(sample(9_800, 'paused'), 1_000);
    expect(timeline.locate(1_000)).toMatchObject({ index: 0, localProgress: 0 });

    timeline.updateSource(sample(20_000, 'paused'), 2_000);
    expect(timeline.locate(2_000)).toBeUndefined();
    expect(timeline.diagnostics(2_000).lateItemCount).toBe(2);
  });
});
