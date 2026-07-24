import { describe, expect, it } from 'vitest';
import { FingerSpeller } from '../../isl/fallback/FingerSpeller';
import type { GlossCandidate, VocabularyEntry } from '../../isl/types';
import { VocabularyLookup } from '../../isl/vocabulary/VocabularyLookup';

const candidate: GlossCandidate = {
  id: 'g1',
  sourceSegmentId: 's1',
  concept: 'thanks',
  gloss: 'THANK-YOU',
  confidence: 0.9,
  category: 'lexical',
};

const entry: VocabularyEntry = {
  tokenId: 'isl:thank-you:default',
  concept: 'gratitude',
  gloss: 'THANK-YOU',
  aliases: ['thanks'],
  category: 'lexical',
  language: 'ISL',
  region: 'India',
  version: '1.0',
  reviewStatus: 'approved',
};

describe('ISL vocabulary and fallback', () => {
  it('uses approved exact and alias entries only', () => {
    const pending = { ...entry, tokenId: 'pending', gloss: 'PENDING', reviewStatus: 'pending' as const };
    const lookup = new VocabularyLookup([entry, pending]);

    expect(lookup.lookup(candidate).status).toBe('exact');
    expect(lookup.lookup({ ...candidate, gloss: 'thanks' }).status).toBe('alias');
    expect(lookup.lookup({ ...candidate, gloss: 'pending' }).status).toBe('missing');
  });

  it('does not guess when an alias is ambiguous', () => {
    const duplicate = { ...entry, tokenId: 'isl:other', gloss: 'OTHER', aliases: ['thanks'] };
    const lookup = new VocabularyLookup([entry, duplicate]);

    expect(lookup.lookup({ ...candidate, gloss: 'thanks' }).status).toBe('missing');
  });

  it('creates explicit fingerspelling candidates without claiming an asset exists', () => {
    const letters = new FingerSpeller().spell({
      ...candidate,
      concept: 'AI',
      gloss: 'AI',
      category: 'proper-noun',
    });

    expect(letters?.map(({ gloss }) => gloss)).toEqual(['FS-A', 'FS-I']);
    expect(new FingerSpeller().spell({ ...candidate, concept: 'AI-2' })).toBeUndefined();
  });
});
