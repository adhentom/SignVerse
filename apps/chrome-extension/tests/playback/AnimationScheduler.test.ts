import { describe, expect, it } from 'vitest';
import { AnimationScheduler } from '../../playback/AnimationScheduler';
import { segmentCaption } from '../../overlay/components/EnglishCaptionTrack';

const sequence = {
  items: [
    { token_id: 'one', asset_id: 'asset-one', duration: 1, confidence: 1 },
    { token_id: 'two', asset_id: 'asset-two', duration: 2, confidence: 0.8 },
  ],
  unsupported_tokens: [],
};

describe('AnimationScheduler', () => {
  it('locates signs, boundaries, and local progress deterministically', () => {
    const scheduler = new AnimationScheduler(sequence);

    expect(scheduler.totalDuration).toBe(3);
    expect(scheduler.locate(0)?.item.token_id).toBe('one');
    expect(scheduler.locate(1)?.item.token_id).toBe('two');
    expect(scheduler.locate(2)?.localProgress).toBe(0.5);
    expect(scheduler.locate(99)?.localProgress).toBe(1);
    expect(scheduler.startOf(1)).toBe(1);
  });

  it('handles empty sequences', () => {
    const scheduler = new AnimationScheduler({ items: [], unsupported_tokens: [] });
    expect(scheduler.totalDuration).toBe(0);
    expect(scheduler.locate(0)).toBeUndefined();
  });

  it('keeps the displayed caption segment aligned with the active sign', () => {
    const scheduler = new AnimationScheduler(sequence);
    const captions = segmentCaption('first phrase second phrase', sequence.items.length);

    expect(captions[scheduler.locate(0.5)!.index]).toBe('first phrase');
    expect(captions[scheduler.locate(1.5)!.index]).toBe('second phrase');
  });
});
