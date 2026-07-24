import { describe, expect, it } from 'vitest';
import { EvaluationReportGenerator } from '../../evaluation/ReportGenerator';
import { VocabularyEvaluator } from '../../evaluation/VocabularyEvaluator';
import { ApprovedVocabularyBuilder } from '../../governance/ApprovedVocabularyBuilder';
import { GovernancePipeline } from '../../governance/GovernancePipeline';
import { RegressionFixtureBuilder } from '../../governance/RegressionFixtureBuilder';
import { ReviewWorkflow } from '../../governance/ReviewWorkflow';
import type { HumanReview, ReviewerRole } from '../../governance/types';
import { VocabularyLookup } from '../../isl/vocabulary/VocabularyLookup';

describe('vocabulary governance pipeline integration', () => {
  it('imports, reviews, releases, regresses, and evaluates one immutable vocabulary version', () => {
    const pipeline = new GovernancePipeline().run([{
      id: 'approved-source',
      format: 'csv',
      content: 'concept,gloss,aliases\nGreeting,HELLO,hi\n',
      fields: { concept: 'concept', gloss: 'gloss', aliases: 'aliases' },
      defaults: {
        source: 'urn:isl:reviewed:greeting',
        license: 'CC-BY-4.0',
        category: 'lexical',
      },
    }]);
    const workflow = new ReviewWorkflow();
    let candidate = workflow.submit(pipeline.records[0]);
    for (const role of ['native-isl', 'linguist', 'licensing'] as ReviewerRole[]) {
      const review: HumanReview = {
        reviewerId: `${role}-1`,
        role,
        decision: 'approve',
        reviewedAt: '2026-07-24T12:00:00Z',
        notes: 'Approved for the governed fixture.',
      };
      candidate = workflow.record(candidate, review);
    }
    const snapshot = new ApprovedVocabularyBuilder().build(
      [candidate],
      pipeline.conflicts,
      { version: '1.0.0', generatedAt: '2026-07-24T12:01:00Z' },
    );
    const fixtures = new RegressionFixtureBuilder().build(snapshot);
    const lookup = new VocabularyLookup(snapshot.entries);

    for (const fixture of fixtures) {
      expect(lookup.lookup({
        id: fixture.id,
        sourceSegmentId: 'regression',
        concept: fixture.query,
        gloss: fixture.query,
        confidence: 1,
        category: 'lexical',
      })).toMatchObject({
        status: fixture.matchType,
        entry: { tokenId: fixture.expectedTokenId },
      });
    }

    const report = new VocabularyEvaluator().evaluate([{
      caseId: 'released-greeting',
      sourceWordCount: 1,
      generatedGlosses: ['HELLO'],
      unknownWords: [],
      fingerspelledGlosses: [],
      validationFailures: [],
      interpretationConfidence: 1,
      playbackItems: 1,
    }], {
      vocabularyVersion: snapshot.vocabularyVersion,
      generatedAt: '2026-07-24T12:02:00Z',
    });
    expect(new EvaluationReportGenerator().markdown(report)).toContain(
      '| Playback success rate | 100.00% |',
    );
  });
});
