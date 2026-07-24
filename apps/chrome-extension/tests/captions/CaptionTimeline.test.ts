import { describe, expect, it } from 'vitest';
import {
  buildCaptionTimeline,
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
});
