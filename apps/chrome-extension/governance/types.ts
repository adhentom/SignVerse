import type { GlossCategory, VocabularyEntry } from '../isl/types';

export type ReviewStatus = 'draft' | 'in-review' | 'approved' | 'rejected' | 'deprecated';
export type ReviewerRole = 'native-isl' | 'linguist' | 'licensing';

export interface DatasetFieldMapping {
  tokenId?: string;
  concept: string;
  gloss: string;
  aliases?: string;
  category?: string;
  region?: string;
  version?: string;
  source?: string;
  license?: string;
}

export interface DatasetImportSource {
  id: string;
  format: 'csv' | 'json';
  content: string;
  fields: DatasetFieldMapping;
  defaults?: {
    category?: GlossCategory;
    region?: string;
    version?: string;
    source?: string;
    license?: string;
  };
}

export interface ImportedVocabularyRecord {
  datasetId: string;
  row: number;
  tokenId?: string;
  concept: string;
  gloss: string;
  aliases: readonly string[];
  category: string;
  region: string;
  version: string;
  source: string;
  license: string;
}

export interface VocabularyProvenance {
  datasetId: string;
  source: string;
  license: string;
  sourceRow: number;
}

export interface GovernedVocabularyRecord {
  entry: Omit<VocabularyEntry, 'reviewStatus'>;
  provenance: VocabularyProvenance;
  reviewStatus: ReviewStatus;
  reviews: readonly HumanReview[];
}

export interface ImportIssue {
  datasetId: string;
  row?: number;
  severity: 'warning' | 'error';
  message: string;
}

export interface ImportResult {
  records: readonly ImportedVocabularyRecord[];
  issues: readonly ImportIssue[];
}

export type ConflictKind =
  | 'exact-duplicate'
  | 'token-id-conflict'
  | 'gloss-conflict'
  | 'alias-conflict'
  | 'provenance-conflict';

export interface VocabularyConflict {
  kind: ConflictKind;
  severity: 'warning' | 'blocking';
  key: string;
  tokenIds: readonly string[];
  message: string;
}

export interface HumanReview {
  reviewerId: string;
  role: ReviewerRole;
  decision: 'approve' | 'reject';
  reviewedAt: string;
  notes: string;
}

export interface ReviewPolicy {
  requiredApprovals: Readonly<Record<ReviewerRole, number>>;
}

export interface ApprovedVocabularySnapshot {
  schemaVersion: 1;
  vocabularyVersion: string;
  generatedAt: string;
  contentFingerprint: string;
  entries: readonly VocabularyEntry[];
  provenance: Readonly<Record<string, VocabularyProvenance>>;
}

export interface VocabularyRegressionFixture {
  id: string;
  query: string;
  expectedTokenId: string;
  expectedGloss: string;
  matchType: 'exact' | 'alias';
  vocabularyVersion: string;
}
