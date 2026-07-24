import type {
  ApprovedVocabularySnapshot,
  VocabularyRegressionFixture,
} from './types';

export class RegressionFixtureBuilder {
  build(snapshot: ApprovedVocabularySnapshot): readonly VocabularyRegressionFixture[] {
    return Object.freeze(snapshot.entries.flatMap((entry) => [
      {
        id: `${entry.tokenId}:exact`,
        query: entry.gloss,
        expectedTokenId: entry.tokenId,
        expectedGloss: entry.gloss,
        matchType: 'exact' as const,
        vocabularyVersion: snapshot.vocabularyVersion,
      },
      ...entry.aliases.map((alias, index) => ({
        id: `${entry.tokenId}:alias:${index + 1}`,
        query: alias,
        expectedTokenId: entry.tokenId,
        expectedGloss: entry.gloss,
        matchType: 'alias' as const,
        vocabularyVersion: snapshot.vocabularyVersion,
      })),
    ]));
  }
}
