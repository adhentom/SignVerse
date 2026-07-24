import { describe, expect, it } from 'vitest';
import { InterpretationEngine } from '../../isl/InterpretationEngine';
import type { GlossInferenceBackend } from '../../isl/providers/GlossInferenceBackend';
import { ProductionInterpretationProvider } from '../../isl/providers/ProductionInterpretationProvider';
import type { InterpretationDatabases } from '../../isl/types';

describe('production interpretation provider integration', () => {
  it('flows through normalization, governed lookup, and existing playback planning', async () => {
    const databases: InterpretationDatabases = {
      glossMappings: [],
      vocabulary: [{
        tokenId: 'isl:hello',
        concept: 'greeting',
        gloss: 'HELLO',
        aliases: ['hi'],
        category: 'lexical',
        language: 'ISL',
        region: 'India',
        version: '1.0',
        reviewStatus: 'approved',
      }],
      signMetadata: [{
        tokenId: 'isl:hello',
        assetId: 'asset-hello',
        durationSeconds: 0.9,
        animationAvailable: true,
        confidence: 0.96,
        reviewStatus: 'approved',
        version: '1.0',
      }],
      transitionRules: [{
        fromCategory: '*',
        toCategory: '*',
        durationMs: 120,
        reviewStatus: 'approved',
      }],
    };
    const backend: GlossInferenceBackend = {
      id: 'rule-model',
      async infer(input) {
        return {
          confidence: 0.93,
          segments: [{
            sourceSegmentId: input.grammar[0].id,
            confidence: 0.93,
            glosses: [{ concept: 'greeting', gloss: 'hi', confidence: 0.94 }],
          }],
        };
      },
    };
    const provider = new ProductionInterpretationProvider(backend, databases.vocabulary);
    const result = await new InterpretationEngine(provider, databases).interpret({
      text: '  Hi. ',
      platform: 'google-meet',
      speaker: 'Ravi',
    });

    expect(result.context.normalizedText).toBe('Hi.');
    expect(result.provider).toMatchObject({
      id: 'production-interpretation',
      confidence: 0.93,
      segments: [expect.objectContaining({ acceptedGlosses: ['HELLO'] })],
    });
    expect(result.playback).toEqual({
      items: [expect.objectContaining({
        token_id: 'isl:hello',
        asset_id: 'asset-hello',
        duration: 0.9,
      })],
      unsupported_tokens: [],
      missing: [],
    });
  });
});
