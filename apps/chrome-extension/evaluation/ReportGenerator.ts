import type { VocabularyEvaluationReport } from './types';

export class EvaluationReportGenerator {
  json(report: VocabularyEvaluationReport): string {
    return `${JSON.stringify(report, null, 2)}\n`;
  }

  markdown(report: VocabularyEvaluationReport): string {
    const metricRows = [
      ['Vocabulary coverage', report.metrics.vocabularyCoverage],
      ['Unknown-word rate', report.metrics.unknownWordRate],
      ['Fingerspelling rate', report.metrics.fingerspellingRate],
      ['Gloss validation failure rate', report.metrics.glossValidationFailureRate],
      ['Interpretation confidence', report.metrics.interpretationConfidence],
      ['Playback success rate', report.metrics.playbackSuccessRate],
    ].map(([name, value]) => `| ${name} | ${percent(value as number)} |`).join('\n');
    const caseRows = report.cases.map((item) => (
      `| ${escapeCell(item.caseId)} | ${item.counts.generatedGlosses} | `
      + `${item.counts.unknownWords} | ${item.counts.validationFailures} | `
      + `${percent(item.metrics.playbackSuccessRate)} |`
    )).join('\n');
    return `# Vocabulary Evaluation Report

- Vocabulary version: \`${report.vocabularyVersion}\`
- Generated at: \`${report.generatedAt}\`
- Cases: ${report.counts.cases}

## Metrics

| Metric | Result |
|---|---:|
${metricRows}

## Case results

| Case | Glosses | Unknown words | Validation failures | Playback success |
|---|---:|---:|---:|---:|
${caseRows || '| No cases | 0 | 0 | 0 | 0.00% |'}
`;
  }
}

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function escapeCell(value: string): string {
  return value.replace(/\|/gu, '\\|').replace(/\r?\n/gu, ' ');
}
