import { describe, expect, it } from 'vitest';
import { ApprovedVocabularyBuilder } from '../../governance/ApprovedVocabularyBuilder';
import { ConflictDetector } from '../../governance/ConflictDetector';
import { RegressionFixtureBuilder } from '../../governance/RegressionFixtureBuilder';
import { ReviewWorkflow } from '../../governance/ReviewWorkflow';
import type { GovernedVocabularyRecord, HumanReview } from '../../governance/types';

function record(overrides: Partial<GovernedVocabularyRecord['entry']> = {}): GovernedVocabularyRecord {
  return {
    entry: {
      tokenId: 'isl:hello:default',
      concept: 'greeting',
      gloss: 'HELLO',
      aliases: ['hi'],
      category: 'lexical',
      language: 'ISL',
      region: 'India',
      version: '1.0.0',
      ...overrides,
    },
    provenance: {
      datasetId: 'reviewed',
      source: 'urn:source:hello',
      license: 'CC-BY-4.0',
      sourceRow: 2,
    },
    reviewStatus: 'draft',
    reviews: [],
  };
}

function review(role: HumanReview['role']): HumanReview {
  return {
    reviewerId: `${role}-reviewer`,
    role,
    decision: 'approve',
    reviewedAt: '2026-07-24T10:00:00Z',
    notes: `${role} review completed.`,
  };
}

describe('governed review and release workflow', () => {
  it('detects blocking token and alias conflicts', () => {
    const conflicts = new ConflictDetector().detect([
      record(),
      record({ tokenId: 'isl:hello:default', concept: 'farewell', gloss: 'GOODBYE' }),
      record({ tokenId: 'isl:welcome:default', concept: 'welcome', gloss: 'WELCOME', aliases: ['hi'] }),
    ]);

    expect(conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'token-id-conflict', severity: 'blocking' }),
      expect.objectContaining({ kind: 'alias-conflict', severity: 'blocking', key: 'hi' }),
    ]));
  });

  it('requires native, linguistic, and licensing approval before release', () => {
    const workflow = new ReviewWorkflow();
    let reviewed = workflow.submit(record());
    reviewed = workflow.record(reviewed, review('native-isl'));
    reviewed = workflow.record(reviewed, review('linguist'));
    expect(reviewed.reviewStatus).toBe('in-review');
    reviewed = workflow.record(reviewed, review('licensing'));
    expect(reviewed.reviewStatus).toBe('approved');

    const snapshot = new ApprovedVocabularyBuilder().build(
      [reviewed],
      new ConflictDetector().detect([reviewed]),
      { version: '1.0.0', generatedAt: '2026-07-24T10:05:00Z' },
    );
    const fixtures = new RegressionFixtureBuilder().build(snapshot);

    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      vocabularyVersion: '1.0.0',
      entries: [expect.objectContaining({ reviewStatus: 'approved', gloss: 'HELLO' })],
    });
    expect(snapshot.contentFingerprint).toMatch(/^fnv1a32:[0-9a-f]{8}$/u);
    expect(fixtures).toEqual([
      expect.objectContaining({ query: 'HELLO', matchType: 'exact' }),
      expect.objectContaining({ query: 'hi', matchType: 'alias' }),
    ]);
  });

  it('blocks automatic approval without explicit provenance', () => {
    const workflow = new ReviewWorkflow();
    let reviewed = workflow.submit({
      ...record(),
      provenance: { datasetId: 'unknown', source: '', license: '', sourceRow: 1 },
    });
    reviewed = workflow.record(reviewed, review('native-isl'));
    reviewed = workflow.record(reviewed, review('linguist'));

    expect(() => workflow.record(reviewed, review('licensing')))
      .toThrow('Source and license are required for approval');
  });

  it('refuses to publish approved entries involved in blocking conflicts', () => {
    const first = { ...record(), reviewStatus: 'approved' as const };
    const second = {
      ...record({ concept: 'farewell', gloss: 'GOODBYE' }),
      reviewStatus: 'approved' as const,
    };
    const conflicts = new ConflictDetector().detect([first, second]);

    expect(() => new ApprovedVocabularyBuilder().build(
      [first, second],
      conflicts,
      { version: '1.0.0', generatedAt: '2026-07-24T10:05:00Z' },
    )).toThrow('blocking conflict');
  });
});
