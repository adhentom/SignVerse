import type {
  ApprovedVocabularySnapshot,
  GovernedVocabularyRecord,
  VocabularyConflict,
} from './types';

export interface VocabularyBuildOptions {
  version: string;
  generatedAt: string;
}

export class ApprovedVocabularyBuilder {
  build(
    records: readonly GovernedVocabularyRecord[],
    conflicts: readonly VocabularyConflict[],
    options: VocabularyBuildOptions,
  ): ApprovedVocabularySnapshot {
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(options.version)) {
      throw new Error('Vocabulary version must use semantic versioning.');
    }
    const approved = records.filter(({ reviewStatus }) => reviewStatus === 'approved');
    const approvedIds = new Set(approved.map(({ entry }) => entry.tokenId));
    const blocking = conflicts.filter((conflict) => (
      conflict.severity === 'blocking'
      && conflict.tokenIds.some((tokenId) => approvedIds.has(tokenId))
    ));
    if (blocking.length > 0) {
      throw new Error(`Approved vocabulary has ${blocking.length} blocking conflict(s).`);
    }
    const entries = approved
      .map(({ entry }) => Object.freeze({ ...entry, reviewStatus: 'approved' as const }))
      .sort((left, right) => left.tokenId.localeCompare(right.tokenId));
    const provenance = Object.fromEntries(approved.map((record) => [
      record.entry.tokenId,
      record.provenance,
    ]));
    const canonical = JSON.stringify({ version: options.version, entries, provenance });
    return Object.freeze({
      schemaVersion: 1,
      vocabularyVersion: options.version,
      generatedAt: options.generatedAt,
      contentFingerprint: fingerprint(canonical),
      entries: Object.freeze(entries),
      provenance: Object.freeze(provenance),
    });
  }
}

function fingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
