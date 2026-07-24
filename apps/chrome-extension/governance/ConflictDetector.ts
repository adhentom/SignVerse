import type { GovernedVocabularyRecord, VocabularyConflict } from './types';
import { normalizeConcept, normalizeGloss } from './VocabularyNormalizer';

export class ConflictDetector {
  detect(records: readonly GovernedVocabularyRecord[]): readonly VocabularyConflict[] {
    const conflicts: VocabularyConflict[] = [];
    compareIndex(records, (record) => record.entry.tokenId, (key, group) => {
      if (group.length < 2) return;
      const signatures = new Set(group.map(signature));
      conflicts.push({
        kind: signatures.size === 1 ? 'exact-duplicate' : 'token-id-conflict',
        severity: signatures.size === 1 ? 'warning' : 'blocking',
        key,
        tokenIds: Object.freeze(group.map(({ entry }) => entry.tokenId)),
        message: signatures.size === 1
          ? `Duplicate record for token ${key}.`
          : `Token ${key} has incompatible definitions.`,
      });
    });
    compareIndex(records, (record) => normalizeGloss(record.entry.gloss), (key, group) => {
      if (new Set(group.map(({ entry }) => entry.concept)).size < 2) return;
      conflicts.push(blocking('gloss-conflict', key, group, `Gloss ${key} maps to multiple concepts.`));
    });
    compareIndex(records, (record) => record.provenance.source, (key, group) => {
      if (!key || new Set(group.map(({ provenance }) => provenance.license)).size < 2) return;
      conflicts.push(blocking(
        'provenance-conflict',
        key,
        group,
        `Source ${key} has conflicting license declarations.`,
      ));
    });

    const terms = new Map<string, GovernedVocabularyRecord[]>();
    for (const record of records) {
      for (const term of [record.entry.concept, ...record.entry.aliases]) {
        const key = normalizeConcept(term);
        const group = terms.get(key) ?? [];
        group.push(record);
        terms.set(key, group);
      }
    }
    for (const [key, group] of terms) {
      if (new Set(group.map(({ entry }) => entry.tokenId)).size < 2) continue;
      conflicts.push(blocking('alias-conflict', key, group, `Concept or alias ${key} is ambiguous.`));
    }
    return Object.freeze(conflicts);
  }
}

function compareIndex(
  records: readonly GovernedVocabularyRecord[],
  keyFor: (record: GovernedVocabularyRecord) => string,
  visit: (key: string, group: GovernedVocabularyRecord[]) => void,
): void {
  const index = new Map<string, GovernedVocabularyRecord[]>();
  for (const record of records) {
    const key = keyFor(record);
    const group = index.get(key) ?? [];
    group.push(record);
    index.set(key, group);
  }
  for (const [key, group] of index) visit(key, group);
}

function signature(record: GovernedVocabularyRecord): string {
  return JSON.stringify({
    entry: record.entry,
    provenance: {
      datasetId: record.provenance.datasetId,
      source: record.provenance.source,
      license: record.provenance.license,
    },
  });
}

function blocking(
  kind: VocabularyConflict['kind'],
  key: string,
  group: readonly GovernedVocabularyRecord[],
  message: string,
): VocabularyConflict {
  return {
    kind,
    severity: 'blocking',
    key,
    tokenIds: Object.freeze(group.map(({ entry }) => entry.tokenId)),
    message,
  };
}
