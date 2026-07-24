import { ConflictDetector } from './ConflictDetector';
import { DatasetImporter } from './DatasetImporter';
import type { DatasetImportSource, ImportIssue, VocabularyConflict } from './types';
import { VocabularyNormalizer } from './VocabularyNormalizer';
import type { GovernedVocabularyRecord } from './types';

export interface GovernancePipelineResult {
  records: readonly GovernedVocabularyRecord[];
  issues: readonly ImportIssue[];
  conflicts: readonly VocabularyConflict[];
}

export class GovernancePipeline {
  constructor(
    private readonly importer = new DatasetImporter(),
    private readonly normalizer = new VocabularyNormalizer(),
    private readonly conflicts = new ConflictDetector(),
  ) {}

  run(sources: readonly DatasetImportSource[]): GovernancePipelineResult {
    const imported = this.importer.import(sources);
    const normalized = this.normalizer.normalize(imported.records);
    return Object.freeze({
      records: normalized.records,
      issues: Object.freeze([...imported.issues, ...normalized.issues]),
      conflicts: this.conflicts.detect(normalized.records),
    });
  }
}
