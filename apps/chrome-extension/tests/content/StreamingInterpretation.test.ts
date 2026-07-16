import { describe, expect, it } from 'vitest';
import { segmentText } from '../../content/interpretation/sentenceSegmentation';
import { mergeInterpretations } from '../../content/interpretation/useStreamingInterpretation';

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
});
