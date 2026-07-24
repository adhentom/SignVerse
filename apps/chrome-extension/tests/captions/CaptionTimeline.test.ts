import { describe, expect, it } from 'vitest';
import {
  bufferedCaptionAtIndex,
  buildCaptionTimeline,
  buildSynchronizedCaptionBuffer,
  captionAtTime,
} from '../../captions/CaptionTimeline';

describe('CaptionTimeline', () => {
  it('weights caption segments by the exact avatar sign durations', () => {
    const timeline = buildCaptionTimeline(
      'one two three four five six',
      [1, 2, 1],
    );

    expect(timeline).toEqual([
      { index: 0, startSeconds: 0, endSeconds: 1, text: 'one' },
      { index: 1, startSeconds: 1, endSeconds: 3, text: 'two three four' },
      { index: 2, startSeconds: 3, endSeconds: 4, text: 'five six' },
    ]);
    expect(captionAtTime(timeline, 0.99)?.index).toBe(0);
    expect(captionAtTime(timeline, 1)?.index).toBe(1);
    expect(captionAtTime(timeline, 3.5)?.index).toBe(2);
  });

  it('normalizes invalid durations and empty captions safely', () => {
    expect(buildCaptionTimeline('', [1])).toEqual([]);
    expect(buildCaptionTimeline('hello world', [0, Number.NaN]))
      .toMatchObject([{ startSeconds: 0, endSeconds: 1 }, { startSeconds: 1, endSeconds: 2 }]);
  });

  it('buffers timestamped source captions and keeps them aligned to sign indexes', () => {
    const buffer = buildSynchronizedCaptionBuffer([
      {
        token_id: 'ONE',
        asset_id: 'one',
        duration: 1,
        confidence: 0.9,
        synchronization: {
          caption_start_ms: 1_000,
          caption_end_ms: 2_000,
          cue_id: 'cue',
          request_sequence: 3,
          source_text: 'A stable buffered caption',
        },
      },
      {
        token_id: 'TWO',
        asset_id: 'two',
        duration: 1,
        confidence: 0.9,
        synchronization: {
          caption_start_ms: 2_000,
          caption_end_ms: 3_000,
          cue_id: 'cue',
          request_sequence: 3,
          source_text: 'A stable buffered caption',
        },
      },
    ]);

    expect(buffer).toEqual([{
      key: '3:cue',
      startIndex: 0,
      endIndex: 1,
      startSeconds: 1,
      endSeconds: 3,
      text: 'A stable buffered caption',
    }]);
    expect(bufferedCaptionAtIndex(buffer, 1)?.text).toBe('A stable buffered caption');
  });
});
