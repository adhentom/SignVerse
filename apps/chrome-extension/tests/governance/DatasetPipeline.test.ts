import { describe, expect, it } from 'vitest';
import { GovernancePipeline } from '../../governance/GovernancePipeline';

describe('dataset import and normalization pipeline', () => {
  it('imports configured CSV and JSON sources into normalized drafts', () => {
    const result = new GovernancePipeline().run([
      {
        id: 'csv-source',
        format: 'csv',
        content: 'concept,gloss,aliases\nGreeting,"hello sign","hello; hi"\n',
        fields: { concept: 'concept', gloss: 'gloss', aliases: 'aliases' },
        defaults: {
          source: 'https://example.test/dataset',
          license: 'CC-BY-4.0',
          category: 'lexical',
        },
      },
      {
        id: 'json-source',
        format: 'json',
        content: JSON.stringify([{ concept: 'thankfulness', gloss: 'THANK YOU' }]),
        fields: { concept: 'concept', gloss: 'gloss' },
        defaults: {
          source: 'urn:dataset:reviewed',
          license: 'CC-BY-4.0',
          category: 'lexical',
        },
      },
    ]);

    expect(result.issues).toEqual([]);
    expect(result.records).toEqual([
      expect.objectContaining({
        entry: expect.objectContaining({
          tokenId: 'isl:greeting:default',
          concept: 'greeting',
          gloss: 'HELLO-SIGN',
          aliases: ['hello', 'hi'],
        }),
        reviewStatus: 'draft',
      }),
      expect.objectContaining({
        entry: expect.objectContaining({
          tokenId: 'isl:thankfulness:default',
          gloss: 'THANK-YOU',
        }),
      }),
    ]);
  });

  it('quarantines malformed records instead of inventing required values', () => {
    const result = new GovernancePipeline().run([{
      id: 'broken',
      format: 'json',
      content: JSON.stringify([{ concept: 'missing gloss' }]),
      fields: { concept: 'concept', gloss: 'gloss' },
    }]);

    expect(result.records).toEqual([]);
    expect(result.issues).toEqual([
      expect.objectContaining({ severity: 'error', message: 'Concept and gloss are required.' }),
    ]);
  });
});
