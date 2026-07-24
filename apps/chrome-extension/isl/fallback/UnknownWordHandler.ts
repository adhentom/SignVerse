import { FingerSpeller } from './FingerSpeller';
import type { GlossCandidate, GlossCategory, UnknownResolution } from '../types';

export interface UnknownWordPolicy {
  fingerspellCategories: readonly GlossCategory[];
}

const SAFE_DEFAULT_POLICY: UnknownWordPolicy = Object.freeze({
  fingerspellCategories: Object.freeze<GlossCategory[]>(['proper-noun']),
});

export class UnknownWordHandler {
  constructor(
    private readonly fingerSpeller = new FingerSpeller(),
    private readonly policy: UnknownWordPolicy = SAFE_DEFAULT_POLICY,
  ) {}

  resolve(candidate: GlossCandidate): UnknownResolution {
    if (this.policy.fingerspellCategories.includes(candidate.category)) {
      const letters = this.fingerSpeller.spell(candidate);
      if (letters) return { status: 'fingerspelled', source: candidate, candidates: letters };
    }
    return {
      status: 'unsupported',
      source: candidate,
      reason: `No approved vocabulary entry for ${candidate.gloss}.`,
    };
  }
}
