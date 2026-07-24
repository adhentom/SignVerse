import type {
  EvaluationCaseResult,
  EvaluationCounts,
  EvaluationMetrics,
  VocabularyEvaluationObservation,
  VocabularyEvaluationReport,
} from './types';

export interface EvaluationOptions {
  vocabularyVersion: string;
  generatedAt: string;
}

export class VocabularyEvaluator {
  evaluate(
    observations: readonly VocabularyEvaluationObservation[],
    options: EvaluationOptions,
  ): VocabularyEvaluationReport {
    const cases = observations.map((observation) => this.caseResult(observation));
    const counts = cases.reduce(addCounts, emptyCounts());
    const confidence = observations.length
      ? observations.reduce((sum, item) => sum + clamp(item.interpretationConfidence), 0)
        / observations.length
      : 0;
    return Object.freeze({
      generatedAt: options.generatedAt,
      vocabularyVersion: options.vocabularyVersion,
      counts,
      metrics: metrics(counts, confidence),
      cases: Object.freeze(cases),
    });
  }

  private caseResult(observation: VocabularyEvaluationObservation): EvaluationCaseResult {
    validateObservation(observation);
    const generated = observation.generatedGlosses.length;
    const failures = observation.validationFailures.length;
    const governed = Math.max(0, generated - failures);
    const counts: EvaluationCounts = {
      cases: 1,
      sourceWords: observation.sourceWordCount,
      generatedGlosses: generated,
      governedGlosses: governed,
      unknownWords: observation.unknownWords.length,
      fingerspelledGlosses: observation.fingerspelledGlosses.length,
      validationFailures: failures,
      playbackItems: observation.playbackItems,
    };
    return Object.freeze({
      caseId: observation.caseId,
      counts,
      metrics: metrics(counts, clamp(observation.interpretationConfidence)),
    });
  }
}

function validateObservation(observation: VocabularyEvaluationObservation): void {
  const counts = [observation.sourceWordCount, observation.playbackItems];
  if (counts.some((value) => !Number.isInteger(value) || value < 0)) {
    throw new Error(`Evaluation counts must be non-negative integers: ${observation.caseId}.`);
  }
  if (!Number.isFinite(observation.interpretationConfidence)) {
    throw new Error(`Interpretation confidence must be finite: ${observation.caseId}.`);
  }
}

function metrics(counts: EvaluationCounts, confidence: number): EvaluationMetrics {
  return Object.freeze({
    vocabularyCoverage: ratio(counts.governedGlosses, counts.generatedGlosses),
    unknownWordRate: ratio(counts.unknownWords, counts.sourceWords),
    fingerspellingRate: ratio(counts.fingerspelledGlosses, counts.generatedGlosses),
    glossValidationFailureRate: ratio(counts.validationFailures, counts.generatedGlosses),
    interpretationConfidence: clamp(confidence),
    playbackSuccessRate: ratio(
      Math.min(counts.playbackItems, counts.governedGlosses),
      counts.governedGlosses,
    ),
  });
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function emptyCounts(): EvaluationCounts {
  return {
    cases: 0,
    sourceWords: 0,
    generatedGlosses: 0,
    governedGlosses: 0,
    unknownWords: 0,
    fingerspelledGlosses: 0,
    validationFailures: 0,
    playbackItems: 0,
  };
}

function addCounts(total: EvaluationCounts, current: EvaluationCaseResult): EvaluationCounts {
  return {
    cases: total.cases + current.counts.cases,
    sourceWords: total.sourceWords + current.counts.sourceWords,
    generatedGlosses: total.generatedGlosses + current.counts.generatedGlosses,
    governedGlosses: total.governedGlosses + current.counts.governedGlosses,
    unknownWords: total.unknownWords + current.counts.unknownWords,
    fingerspelledGlosses: total.fingerspelledGlosses + current.counts.fingerspelledGlosses,
    validationFailures: total.validationFailures + current.counts.validationFailures,
    playbackItems: total.playbackItems + current.counts.playbackItems,
  };
}
