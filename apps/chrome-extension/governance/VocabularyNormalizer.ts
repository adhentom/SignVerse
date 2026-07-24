import type { GlossCategory } from '../isl/types';
import type {
  GovernedVocabularyRecord,
  ImportedVocabularyRecord,
  ImportIssue,
} from './types';

const CATEGORIES = new Set<GlossCategory>([
  'lexical',
  'classifier',
  'fingerspelling',
  'number',
  'date',
  'proper-noun',
  'unknown',
]);

export interface NormalizationResult {
  records: readonly GovernedVocabularyRecord[];
  issues: readonly ImportIssue[];
}

export class VocabularyNormalizer {
  normalize(records: readonly ImportedVocabularyRecord[]): NormalizationResult {
    const normalized: GovernedVocabularyRecord[] = [];
    const issues: ImportIssue[] = [];
    for (const record of records) {
      const category = record.category.toLocaleLowerCase('en') as GlossCategory;
      if (!CATEGORIES.has(category)) {
        issues.push({
          datasetId: record.datasetId,
          row: record.row,
          severity: 'error',
          message: `Unsupported vocabulary category: ${record.category}.`,
        });
        continue;
      }
      const concept = normalizeConcept(record.concept);
      const gloss = normalizeGloss(record.gloss);
      if (!concept || !gloss) {
        issues.push({
          datasetId: record.datasetId,
          row: record.row,
          severity: 'error',
          message: 'Concept or gloss is empty after normalization.',
        });
        continue;
      }
      normalized.push(Object.freeze({
        entry: Object.freeze({
          tokenId: normalizeTokenId(record.tokenId || `isl:${slug(concept)}:default`),
          concept,
          gloss,
          aliases: Object.freeze([...new Set(record.aliases.map(normalizeConcept).filter(Boolean))]),
          category,
          language: 'ISL' as const,
          region: normalizeWhitespace(record.region) || 'India',
          version: normalizeWhitespace(record.version) || '1.0.0',
        }),
        provenance: Object.freeze({
          datasetId: record.datasetId,
          source: normalizeWhitespace(record.source),
          license: normalizeWhitespace(record.license),
          sourceRow: record.row,
        }),
        reviewStatus: 'draft' as const,
        reviews: Object.freeze([]),
      }));
    }
    return { records: Object.freeze(normalized), issues: Object.freeze(issues) };
  }
}

export function normalizeGloss(value: string): string {
  return normalizeWhitespace(value)
    .replace(/[_\s]+/gu, '-')
    .replace(/-{2,}/gu, '-')
    .toLocaleUpperCase('en');
}

export function normalizeConcept(value: string): string {
  return normalizeWhitespace(value).toLocaleLowerCase('en');
}

function normalizeTokenId(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en').replace(/\s+/gu, '-');
}

function normalizeWhitespace(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

function slug(value: string): string {
  return value.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/gu, '') || 'unknown';
}
