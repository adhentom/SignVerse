import type { GlossCandidate } from '../types';

const SUPPORTED_CHARACTER = /^[A-Z]$/u;

export class FingerSpeller {
  spell(candidate: GlossCandidate): readonly GlossCandidate[] | undefined {
    const characters = [...candidate.concept.normalize('NFKC').toLocaleUpperCase('en')]
      .filter((character) => character !== ' ');
    if (characters.length === 0 || !characters.every((character) => SUPPORTED_CHARACTER.test(character))) {
      return undefined;
    }
    return Object.freeze(characters.map((character, index) => Object.freeze({
      id: `${candidate.id}-letter-${index + 1}`,
      sourceSegmentId: candidate.sourceSegmentId,
      concept: character,
      gloss: `FS-${character}`,
      confidence: candidate.confidence,
      category: 'fingerspelling' as const,
    })));
  }
}
