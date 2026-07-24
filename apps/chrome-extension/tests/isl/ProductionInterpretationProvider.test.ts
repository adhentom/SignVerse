import { describe, expect, it } from 'vitest';
import type { GlossInferenceBackend } from '../../isl/providers/GlossInferenceBackend';
import { ProductionInterpretationProvider } from '../../isl/providers/ProductionInterpretationProvider';
import type { GlossProviderInput, VocabularyEntry } from '../../isl/types';

const input: GlossProviderInput = {
  context: {
    sourceText: 'Thank you, OpenAI.',
    normalizedText: 'Thank you, OpenAI.',
    locale: 'en',
    platform: 'website',
    previousTurns: [],
  },
  grammar: [{
    id: 'sentence-1',
    text: 'Thank you, OpenAI.',
    tokens: ['Thank', 'you', 'OpenAI'],
    features: {
      sentenceType: 'statement',
      polarity: 'positive',
      modality: [],
      pronouns: ['you'],
      temporalMarkers: [],
    },
  }],
};

const vocabulary: VocabularyEntry[] = [
  {
    tokenId: 'isl:thank-you',
    concept: 'gratitude',
    gloss: 'THANK-YOU',
    aliases: ['thanks'],
    category: 'lexical',
    language: 'ISL',
    region: 'India',
    version: '1.0',
    reviewStatus: 'approved',
  },
  ...['A', 'I'].map((letter): VocabularyEntry => ({
    tokenId: `isl:fs-${letter.toLowerCase()}`,
    concept: letter,
    gloss: `FS-${letter}`,
    aliases: [],
    category: 'fingerspelling',
    language: 'ISL',
    region: 'India',
    version: '1.0',
    reviewStatus: 'approved',
  })),
  {
    tokenId: 'isl:pending',
    concept: 'unreviewed',
    gloss: 'UNREVIEWED',
    aliases: [],
    category: 'lexical',
    language: 'ISL',
    region: 'India',
    version: '1.0',
    reviewStatus: 'pending',
  },
];

const backend: GlossInferenceBackend = {
  id: 'local-test-model',
  async infer() {
    return {
      confidence: 0.9,
      diagnostics: { model: 'test' },
      segments: [{
        sourceSegmentId: 'sentence-1',
        confidence: 0.88,
        diagnostics: { latencyMs: 12 },
        glosses: [
          { concept: 'gratitude', gloss: 'THANK-YOU', confidence: 0.95 },
          { concept: 'AI', gloss: 'OPENAI', confidence: 0.86, category: 'proper-noun' },
          { concept: 'unreviewed', gloss: 'UNREVIEWED', confidence: 0.91 },
          { concept: 'uncertain', gloss: 'UNCERTAIN', confidence: 0.2 },
        ],
      }],
    };
  },
};

describe('ProductionInterpretationProvider', () => {
  it('emits only governed vocabulary or complete governed fingerspelling', async () => {
    const output = await new ProductionInterpretationProvider(backend, vocabulary).generate(input);

    expect(output.candidates.map(({ gloss }) => gloss)).toEqual([
      'THANK-YOU',
      'FS-A',
      'FS-I',
    ]);
    expect(output.candidates.every(({ gloss }) => gloss !== 'UNREVIEWED')).toBe(true);
    expect(output.diagnostics).toMatchObject({
      provider: 'production-interpretation',
      backend: 'local-test-model',
      governedVocabularyOnly: true,
    });
  });

  it('returns confidence and auditable diagnostics for every segment', async () => {
    const output = await new ProductionInterpretationProvider(backend, vocabulary).generate(input);

    expect(output.confidence).toBe(0.9);
    expect(output.segmentDiagnostics).toEqual([expect.objectContaining({
      segmentId: 'sentence-1',
      confidence: 0.88,
      receivedGlosses: ['THANK-YOU', 'OPENAI', 'UNREVIEWED', 'UNCERTAIN'],
      acceptedGlosses: ['THANK-YOU'],
      fingerspelledGlosses: ['OPENAI'],
      rejectedGlosses: [
        expect.objectContaining({ gloss: 'UNREVIEWED' }),
        expect.objectContaining({ gloss: 'UNCERTAIN' }),
      ],
      backendDiagnostics: { latencyMs: 12 },
    })]);
  });

  it('rejects fingerspelling when one required letter is not approved', async () => {
    const output = await new ProductionInterpretationProvider(
      backend,
      vocabulary.filter(({ gloss }) => gloss !== 'FS-I'),
    ).generate(input);

    expect(output.candidates.map(({ gloss }) => gloss)).toEqual(['THANK-YOU']);
    expect(output.segmentDiagnostics?.[0].rejectedGlosses).toContainEqual(
      expect.objectContaining({ gloss: 'OPENAI' }),
    );
  });
});
