export interface VocabularyEvaluationObservation {
  caseId: string;
  sourceWordCount: number;
  generatedGlosses: readonly string[];
  unknownWords: readonly string[];
  fingerspelledGlosses: readonly string[];
  validationFailures: readonly string[];
  interpretationConfidence: number;
  playbackItems: number;
}

export interface EvaluationCounts {
  cases: number;
  sourceWords: number;
  generatedGlosses: number;
  governedGlosses: number;
  unknownWords: number;
  fingerspelledGlosses: number;
  validationFailures: number;
  playbackItems: number;
}

export interface EvaluationMetrics {
  vocabularyCoverage: number;
  unknownWordRate: number;
  fingerspellingRate: number;
  glossValidationFailureRate: number;
  interpretationConfidence: number;
  playbackSuccessRate: number;
}

export interface EvaluationCaseResult {
  caseId: string;
  counts: EvaluationCounts;
  metrics: EvaluationMetrics;
}

export interface VocabularyEvaluationReport {
  generatedAt: string;
  vocabularyVersion: string;
  counts: EvaluationCounts;
  metrics: EvaluationMetrics;
  cases: readonly EvaluationCaseResult[];
}
