import { describe, expect, it } from 'vitest';
import { ContextNormalizer } from '../../isl/normalization/ContextNormalizer';
import { GrammarNormalizer } from '../../isl/normalization/GrammarNormalizer';
import { SentenceSegmenter } from '../../isl/segmentation/SentenceSegmenter';

describe('ISL source preparation', () => {
  it('segments sentences with stable source offsets', () => {
    const text = 'I will go tomorrow. Will you come?';
    const segments = new SentenceSegmenter().segment(text);

    expect(segments.map(({ text: value }) => value)).toEqual([
      'I will go tomorrow.',
      'Will you come?',
    ]);
    expect(segments.map(({ start, end }) => text.slice(start, end))).toEqual(
      segments.map(({ text: value }) => value),
    );
  });

  it('normalizes context without destroying source meaning', () => {
    const normalized = new ContextNormalizer().normalize({
      text: '  Please\u00a0come   tomorrow.  ',
      platform: 'youtube',
      speaker: ' Asha ',
      previousTurns: [' hello ', '', 'please listen'],
    });

    expect(normalized.normalizedText).toBe('Please come tomorrow.');
    expect(normalized.speaker).toBe('Asha');
    expect(normalized.previousTurns).toEqual(['hello', 'please listen']);
  });

  it('extracts source-language grammar features without imposing English word order', () => {
    const segments = new SentenceSegmenter().segment('Can you not come tomorrow?');
    const [unit] = new GrammarNormalizer().normalize(segments);

    expect(unit.features).toMatchObject({
      sentenceType: 'question',
      polarity: 'negative',
      modality: ['can'],
      pronouns: ['you'],
      temporalMarkers: ['tomorrow'],
    });
  });
});
