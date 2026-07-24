import type { GlossCandidate, VocabularyEntry, VocabularyMatch } from '../types';
import { normalizeLookupTerm } from './normalizeLookupTerm';

export class VocabularyLookup {
  private readonly exact = new Map<string, VocabularyEntry>();
  private readonly aliases = new Map<string, VocabularyEntry>();
  private readonly ambiguousExact = new Set<string>();
  private readonly ambiguousAliases = new Set<string>();

  constructor(entries: readonly VocabularyEntry[]) {
    for (const entry of entries) {
      if (entry.reviewStatus !== 'approved') continue;
      this.addUnique(this.exact, this.ambiguousExact, normalizeLookupTerm(entry.gloss), entry);
      for (const alias of [entry.concept, ...entry.aliases]) {
        this.addUnique(this.aliases, this.ambiguousAliases, normalizeLookupTerm(alias), entry);
      }
    }
  }

  lookup(candidate: GlossCandidate): VocabularyMatch {
    const key = normalizeLookupTerm(candidate.gloss);
    const exact = this.exact.get(key);
    if (exact) return { status: 'exact', candidate, entry: exact };
    const alias = this.aliases.get(key);
    if (alias) return { status: 'alias', candidate, entry: alias };
    return { status: 'missing', candidate };
  }

  private addUnique(
    index: Map<string, VocabularyEntry>,
    ambiguous: Set<string>,
    key: string,
    entry: VocabularyEntry,
  ): void {
    if (!key || ambiguous.has(key)) return;
    const existing = index.get(key);
    if (existing && existing.tokenId !== entry.tokenId) {
      index.delete(key);
      ambiguous.add(key);
      return;
    }
    index.set(key, entry);
  }
}
