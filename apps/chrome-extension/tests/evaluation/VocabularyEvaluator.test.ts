import { describe, expect, it } from 'vitest';
import { EvaluationReportGenerator } from '../../evaluation/ReportGenerator';
import { VocabularyEvaluator } from '../../evaluation/VocabularyEvaluator';

describe('vocabulary evaluation', () => {
  it('calculates governed coverage, fallback, validation, confidence, and playback metrics', () => {
    const report = new VocabularyEvaluator().evaluate([
      {
        caseId: 'greeting',
        sourceWordCount: 4,
        generatedGlosses: ['HELLO', 'FS-A', 'UNKNOWN'],
        unknownWords: ['unknown'],
        fingerspelledGlosses: ['FS-A'],
        validationFailures: ['UNKNOWN'],
        interpretationConfidence: 0.8,
        playbackItems: 2,
      },
      {
        caseId: 'thanks',
        sourceWordCount: 2,
        generatedGlosses: ['THANK-YOU'],
        unknownWords: [],
        fingerspelledGlosses: [],
        validationFailures: [],
        interpretationConfidence: 0.9,
        playbackItems: 1,
      },
    ], {
      vocabularyVersion: '1.0.0',
      generatedAt: '2026-07-24T11:00:00Z',
    });

    expect(report.counts).toEqual({
      cases: 2,
      sourceWords: 6,
      generatedGlosses: 4,
      governedGlosses: 3,
      unknownWords: 1,
      fingerspelledGlosses: 1,
      validationFailures: 1,
      playbackItems: 3,
    });
    expect(report.metrics).toEqual({
      vocabularyCoverage: 0.75,
      unknownWordRate: 1 / 6,
      fingerspellingRate: 0.25,
      glossValidationFailureRate: 0.25,
      interpretationConfidence: 0.8500000000000001,
      playbackSuccessRate: 1,
    });

    const markdown = new EvaluationReportGenerator().markdown(report);
    expect(markdown).toContain('| Vocabulary coverage | 75.00% |');
    expect(markdown).toContain('| greeting | 3 | 1 | 1 | 100.00% |');
    expect(JSON.parse(new EvaluationReportGenerator().json(report))).toMatchObject({
      vocabularyVersion: '1.0.0',
    });
  });
});
