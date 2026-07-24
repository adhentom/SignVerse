import { describe, expect, it } from 'vitest';
import { InterpretationEngine } from '../../isl/InterpretationEngine';
import type { ISLGlossProvider } from '../../isl/providers/ISLGlossProvider';
import type { InterpretationDatabases } from '../../isl/types';

const provider: ISLGlossProvider = {
  id: 'test-provider',
  async generate({ grammar }) {
    return {
      confidence: 0.94,
      candidates: [
        {
          id: 'g1',
          sourceSegmentId: grammar[0].id,
          concept: 'gratitude',
          gloss: 'thank you',
          confidence: 0.92,
          category: 'lexical',
        },
        {
          id: 'g2',
          sourceSegmentId: grammar[0].id,
          concept: 'unmapped concept',
          gloss: 'unmapped concept',
          confidence: 0.8,
          category: 'lexical',
        },
      ],
    };
  },
};

const databases: InterpretationDatabases = {
  glossMappings: [],
  vocabulary: [{
    tokenId: 'isl:thank-you:default',
    concept: 'gratitude',
    gloss: 'THANK-YOU',
    aliases: ['thanks'],
    category: 'lexical',
    language: 'ISL',
    region: 'India',
    version: '1.0',
    reviewStatus: 'approved',
  }],
  signMetadata: [{
    tokenId: 'isl:thank-you:default',
    assetId: 'asset-thank-you',
    durationSeconds: 1.2,
    animationAvailable: true,
    confidence: 0.95,
    reviewStatus: 'approved',
    version: '1.0',
  }],
  transitionRules: [{
    fromCategory: '*',
    toCategory: '*',
    durationMs: 150,
    reviewStatus: 'approved',
  }],
};

describe('provider-neutral ISL interpretation engine', () => {
  it('keeps provider selection upstream and emits the existing playback contract', async () => {
    const result = await new InterpretationEngine(provider, databases).interpret({
      text: 'Thank you for helping.',
      platform: 'website',
    });

    expect(result.glosses.map(({ gloss }) => gloss)).toEqual(['THANK-YOU', 'UNMAPPED-CONCEPT']);
    expect(result.playback.items).toEqual([expect.objectContaining({
      token_id: 'isl:thank-you:default',
      asset_id: 'asset-thank-you',
      duration: 1.2,
      transition_ms: 150,
      animation_ready: true,
    })]);
    expect(result.playback.unsupported_tokens).toEqual(['UNMAPPED-CONCEPT']);
    expect(result.playback.missing?.[0]).toMatchObject({
      reason: 'unknown-gloss',
      token: 'UNMAPPED-CONCEPT',
    });
  });

  it('never schedules pending vocabulary or unapproved sign metadata', async () => {
    const unsafe: InterpretationDatabases = {
      ...databases,
      vocabulary: databases.vocabulary.map((entry) => ({ ...entry, reviewStatus: 'pending' })),
    };

    const result = await new InterpretationEngine(provider, unsafe).interpret({ text: 'Thank you.' });

    expect(result.playback.items).toEqual([]);
    expect(result.playback.unsupported_tokens).toContain('THANK-YOU');
  });
});
