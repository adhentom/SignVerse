import { describe, expect, it } from 'vitest';
import { InterpretationEngine } from '../../isl/InterpretationEngine';
import { MappingGlossProvider } from '../../isl/providers/MappingGlossProvider';
import type { InterpretationDatabases } from '../../isl/types';

describe('ISL interpretation architecture integration', () => {
  it('runs segmentation through reviewed mapping, lookup, animation, and playback planning', async () => {
    const databases: InterpretationDatabases = {
      glossMappings: [{
        source: 'Hello.',
        canonicalGlosses: ['HELLO'],
        locale: 'en',
        reviewStatus: 'approved',
        version: '1.0',
      }],
      vocabulary: [{
        tokenId: 'isl:hello:default',
        concept: 'greeting',
        gloss: 'HELLO',
        aliases: [],
        category: 'lexical',
        language: 'ISL',
        region: 'India',
        version: '1.0',
        reviewStatus: 'approved',
      }],
      signMetadata: [{
        tokenId: 'isl:hello:default',
        assetId: 'asset-hello',
        durationSeconds: 0.8,
        animationAvailable: false,
        confidence: 1,
        reviewStatus: 'approved',
        version: '1.0',
      }],
      transitionRules: [],
    };
    const engine = new InterpretationEngine(
      new MappingGlossProvider(databases.glossMappings),
      databases,
    );

    const result = await engine.interpret({ text: 'Hello.', locale: 'en' });

    expect(result.segments).toHaveLength(1);
    expect(result.grammar).toHaveLength(1);
    expect(result.playback.items).toEqual([expect.objectContaining({
      asset_id: 'asset-hello',
      animation_ready: false,
    })]);
  });
});
