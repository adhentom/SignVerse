import { describe, expect, it } from 'vitest';
import { segmentText } from '../../content/interpretation/sentenceSegmentation';
import {
  incrementalLiveText,
  mergeInterpretations,
  segmentIdentity,
} from '../../content/interpretation/useStreamingInterpretation';

describe('real-time interpretation pipeline', () => {
  it('segments paragraphs and completed sentences incrementally', () => {
    expect(segmentText('First sentence. Second sentence!\n\nThird paragraph')).toEqual([
      'First sentence.', 'Second sentence!', 'Third paragraph',
    ]);
  });

  it('appends Malayalam, gloss, and playback without replacing active history', () => {
    const response = (label: string) => ({
      summary: label,
      malayalam_translation: label,
      key_points: [label], keywords: [label], glossary: [label], isl_gloss: [label], confidence: 0.9,
      playback: { items: [{ token_id: label, asset_id: label, duration: 1, confidence: 0.9 }], unsupported_tokens: [] },
    });
    const merged = mergeInterpretations(response('one'), response('two'));
    expect(merged.malayalam_translation).toBe('one\ntwo');
    expect(merged.isl_gloss).toEqual(['one', 'two']);
    expect(merged.playback?.items.map((item) => item.token_id)).toEqual(['one', 'two']);
  });

  it('streams only newly appended live-caption text and preserves corrections', () => {
    expect(incrementalLiveText('hello', 'hello world')).toBe('world');
    expect(incrementalLiveText('hello world', 'hello there')).toBe('hello there');
  });

  it('isolates opt-in diagnostics from the normal streaming source', () => {
    const packet = {
      platform: 'website' as const, title: 'Article', timestamp: '0', text: 'Readable paragraph.',
      metadata: { pageUrl: 'https://example.test/article' },
    };

    expect(segmentIdentity(packet)).not.toBe(segmentIdentity({
      ...packet, metadata: { ...packet.metadata, debug: true },
    }));
  });
});
